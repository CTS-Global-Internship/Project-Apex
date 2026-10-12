-- Project Apex · CTS Trader's Apprenticeship
-- 001: tables, helpers, sign-up trigger
-- Run in Supabase SQL Editor, in order: 001, 002, 003, then seed.sql.

create extension if not exists pgcrypto;

-- ── Settings (one row) ─────────────────────────────────────────────
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  weight_quiz int not null default 40 check (weight_quiz >= 0),
  weight_drill int not null default 40 check (weight_drill >= 0),
  weight_completion int not null default 20 check (weight_completion >= 0),
  quiz_pass_mark int not null default 70 check (quiz_pass_mark between 0 and 100),
  drill_pass_mark int not null default 70 check (drill_pass_mark between 0 and 100),
  quiz_max_attempts int not null default 3 check (quiz_max_attempts between 1 and 20),
  updated_at timestamptz not null default now()
);
insert into public.app_settings default values;

-- ── Promotion ladder ───────────────────────────────────────────────
create table public.levels (
  id serial primary key,
  rank int not null unique,
  name text not null,
  description text not null default '',
  min_score int not null default 0 check (min_score between 0 and 1000),
  min_modules int not null default 0 check (min_modules >= 0),
  min_drills_passed int not null default 0 check (min_drills_passed >= 0)
);

-- ── People ─────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  school text not null default '',
  role text not null default 'intern' check (role in ('intern','mentor','admin')),
  cohort text not null default '',
  level_id int references public.levels(id),
  created_at timestamptz not null default now()
);

create table public.invite_codes (
  code text primary key check (code = upper(code) and length(code) between 4 and 40),
  role text not null default 'intern' check (role in ('intern','mentor','admin')),
  cohort text not null default '',
  max_uses int not null default 30 check (max_uses > 0),
  uses int not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  note text not null default '',
  created_at timestamptz not null default now()
);

-- ── Content ────────────────────────────────────────────────────────
create table public.modules (
  id uuid primary key default gen_random_uuid(),
  week int not null default 1 check (week between 1 and 52),
  position int not null default 1,
  title text not null check (length(trim(title)) > 0),
  objective text not null default '',
  body text not null default '',
  video_url text not null default '',
  resource_url text not null default '',
  drill_prompt text not null default '',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Mentor-only notes on what a good drill answer looks like
create table public.module_private (
  module_id uuid primary key references public.modules(id) on delete cascade,
  drill_guide text not null default ''
);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  position int not null default 1,
  prompt text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  explanation text not null default ''
);
create index on public.quiz_questions(module_id, position);

-- Correct answers live apart from the questions so interns can never read them
create table public.quiz_answer_keys (
  question_id uuid primary key references public.quiz_questions(id) on delete cascade,
  correct_index int not null check (correct_index >= 0)
);

-- ── Intern work (written only by server functions) ────────────────
create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  score numeric(5,2) not null,
  answers jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index on public.quiz_attempts(user_id, module_id);

create table public.drill_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  answer text not null,
  status text not null default 'submitted' check (status in ('submitted','reviewed')),
  score int check (score between 0 and 100),
  feedback text not null default '',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, module_id)
);

-- ── Role helpers ───────────────────────────────────────────────────
create function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('mentor','admin'), false)
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

-- ── Sign-up: an invite code is required ────────────────────────────
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
  inv public.invite_codes;
begin
  select * into inv from public.invite_codes where code = v_code for update;
  if not found or not inv.active or inv.uses >= inv.max_uses
     or (inv.expires_at is not null and inv.expires_at < now()) then
    raise exception 'INVALID_INVITE_CODE';
  end if;

  update public.invite_codes set uses = uses + 1 where code = v_code;

  insert into public.profiles (id, email, full_name, school, role, cohort, level_id)
  values (
    new.id, coalesce(new.email, ''),
    left(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), 120),
    left(trim(coalesce(new.raw_user_meta_data->>'school', '')), 120),
    inv.role, inv.cohort,
    (select id from public.levels order by rank limit 1)
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lets the sign-up form check a code before creating the account
create function public.check_invite_code(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.invite_codes
    where code = upper(trim(p_code)) and active and uses < max_uses
      and (expires_at is null or expires_at > now())
  )
$$;
