-- Project Apex · full setup (001 + 002 + 003 + seed). Run ONCE in Supabase SQL Editor.

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

-- Project Apex · 002: scoring and actions
-- Everything that changes a score runs here, on the server.

-- ── Per-module status for one person ──────────────────────────────
create function public.module_status(uid uuid)
returns table (
  module_id uuid, week int, "position" int, title text, objective text,
  has_quiz boolean, has_drill boolean, question_count int,
  quiz_best numeric, attempts_used int, attempts_left int,
  drill_status text, drill_score int, completed boolean
)
language sql stable security definer set search_path = public as $$
  with s as (select * from public.app_settings where id = 1)
  select
    m.id, m.week, m.position, m.title, m.objective,
    qc.n > 0, m.drill_prompt <> '', qc.n::int,
    qa.best, coalesce(qa.used, 0)::int,
    greatest(s.quiz_max_attempts - coalesce(qa.used, 0), 0)::int,
    d.status, case when d.status = 'reviewed' then d.score end,
    (qc.n = 0 or coalesce(qa.best, 0) >= s.quiz_pass_mark)
      and (m.drill_prompt = '' or d.id is not null)
  from public.modules m
  cross join s
  cross join lateral (select count(*) n from public.quiz_questions q where q.module_id = m.id) qc
  left join lateral (
    select max(a.score) best, count(*) used from public.quiz_attempts a
    where a.module_id = m.id and a.user_id = uid
  ) qa on true
  left join public.drill_submissions d on d.module_id = m.id and d.user_id = uid
  where m.published
  order by m.week, m.position, m.title
$$;

-- ── Apex Score (0–1000) and the numbers behind it ──────────────────
-- quiz_avg     best quiz score per published module (not attempted = 0)
-- drill_avg    mentor drill score per published module (not reviewed = 0)
-- completion   share of published modules completed
-- score        weighted blend of the three, scaled to 1000
create function public.intern_stats(uid uuid)
returns table (
  score int, quiz_avg numeric, drill_avg numeric, completion_pct numeric,
  modules_completed int, drills_passed int, published_modules int
)
language sql stable security definer set search_path = public as $$
  with s as (select * from public.app_settings where id = 1),
  per as (select * from public.module_status(uid)),
  agg as (
    select
      coalesce(avg(coalesce(quiz_best, 0)) filter (where has_quiz), 0) qa,
      coalesce(avg(coalesce(drill_score, 0)) filter (where has_drill), 0) da,
      coalesce(100.0 * count(*) filter (where completed) / nullif(count(*), 0), 0) cp,
      count(*) filter (where completed)::int mc,
      count(*) filter (where has_drill and drill_score >= (select drill_pass_mark from s))::int dp,
      count(*)::int n
    from per
  )
  select
    coalesce(round(10 * (s.weight_quiz * qa + s.weight_drill * da + s.weight_completion * cp)
      / nullif(s.weight_quiz + s.weight_drill + s.weight_completion, 0)), 0)::int,
    round(qa, 1), round(da, 1), round(cp, 1), mc, dp, n
  from agg, s
$$;

-- ── Leaderboard (interns only) ─────────────────────────────────────
create function public.leaderboard(p_cohort text default null)
returns table (
  user_id uuid, full_name text, cohort text, level_name text,
  score int, modules_completed int, completion_pct numeric, rank bigint
)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.cohort, l.name,
         st.score, st.modules_completed, st.completion_pct,
         rank() over (order by st.score desc)
  from public.profiles p
  left join public.levels l on l.id = p.level_id
  cross join lateral public.intern_stats(p.id) st
  where auth.uid() is not null
    and p.role = 'intern'
    and (p_cohort is null or p_cohort = '' or p.cohort = p_cohort)
  order by st.score desc, p.full_name
$$;

-- ── Promotion readiness for the next rung ──────────────────────────
create function public.promotion_check(uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  st record; cur public.levels; nxt public.levels;
begin
  select * into st from public.intern_stats(uid);
  select l.* into cur from public.profiles p join public.levels l on l.id = p.level_id where p.id = uid;
  select * into nxt from public.levels
    where rank > coalesce(cur.rank, 0) order by rank limit 1;
  if nxt.id is null then
    return jsonb_build_object('current', to_jsonb(cur), 'next', null, 'ready', false, 'checks', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'current', to_jsonb(cur),
    'next', to_jsonb(nxt),
    'ready', st.score >= nxt.min_score and st.modules_completed >= nxt.min_modules
             and st.drills_passed >= nxt.min_drills_passed,
    'checks', jsonb_build_array(
      jsonb_build_object('label', 'Apex Score', 'have', st.score, 'need', nxt.min_score),
      jsonb_build_object('label', 'Modules completed', 'have', st.modules_completed, 'need', nxt.min_modules),
      jsonb_build_object('label', 'Drills passed', 'have', st.drills_passed, 'need', nxt.min_drills_passed)
    )
  );
end $$;

-- ── Dashboard: everything the home page needs in one call ──────────
create function public.my_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prof public.profiles; st record; my_rank bigint; cohort_size bigint;
  nxt jsonb; activity jsonb;
begin
  if uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into prof from public.profiles where id = uid;
  select * into st from public.intern_stats(uid);

  select lb.rank into my_rank from public.leaderboard(nullif(prof.cohort, '')) lb where lb.user_id = uid;
  select count(*) into cohort_size from public.profiles
    where role = 'intern' and (prof.cohort = '' or cohort = prof.cohort);

  select to_jsonb(ms) into nxt from public.module_status(uid) ms where not ms.completed limit 1;

  select coalesce(jsonb_agg(e order by e.at desc), '[]'::jsonb) into activity from (
    select * from (
      select a.created_at at, 'quiz' kind, m.title, round(a.score)::int value, null::text status
      from public.quiz_attempts a join public.modules m on m.id = a.module_id
      where a.user_id = uid
      union all
      select coalesce(d.reviewed_at, d.updated_at), 'drill', m.title, d.score, d.status
      from public.drill_submissions d join public.modules m on m.id = d.module_id
      where d.user_id = uid
    ) x order by at desc limit 8
  ) e;

  return jsonb_build_object(
    'profile', jsonb_build_object('full_name', prof.full_name, 'role', prof.role, 'cohort', prof.cohort, 'school', prof.school),
    'stats', to_jsonb(st),
    'rank', my_rank,
    'cohort_size', cohort_size,
    'promotion', public.promotion_check(uid),
    'next_module', nxt,
    'activity', activity,
    'settings', (select to_jsonb(s) from public.app_settings s where id = 1)
  );
end $$;

create function public.my_modules()
returns table (
  module_id uuid, week int, "position" int, title text, objective text,
  has_quiz boolean, has_drill boolean, question_count int,
  quiz_best numeric, attempts_used int, attempts_left int,
  drill_status text, drill_score int, completed boolean
)
language sql stable security definer set search_path = public as $$
  select * from public.module_status(auth.uid())
$$;

-- ── Quiz: scored on the server ─────────────────────────────────────
create function public.submit_quiz(p_module uuid, p_answers int[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.app_settings; used int; correct int := 0; total int := 0;
  results jsonb := '[]'; q record; sc numeric; left_after int; reveal boolean;
begin
  if uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not exists (select 1 from public.modules where id = p_module and published) then
    raise exception 'MODULE_NOT_AVAILABLE';
  end if;
  select * into s from public.app_settings where id = 1;
  select count(*) into used from public.quiz_attempts where user_id = uid and module_id = p_module;
  if used >= s.quiz_max_attempts then raise exception 'NO_ATTEMPTS_LEFT'; end if;

  for q in
    select qq.id, qq.explanation, k.correct_index
    from public.quiz_questions qq join public.quiz_answer_keys k on k.question_id = qq.id
    where qq.module_id = p_module order by qq.position, qq.id
  loop
    total := total + 1;
    if p_answers[total] is not distinct from q.correct_index then correct := correct + 1; end if;
    results := results || jsonb_build_object(
      'question_id', q.id,
      'correct', p_answers[total] is not distinct from q.correct_index,
      'explanation', q.explanation);
  end loop;
  if total = 0 then raise exception 'NO_QUESTIONS'; end if;

  sc := round(100.0 * correct / total, 2);
  insert into public.quiz_attempts (user_id, module_id, score, answers)
  values (uid, p_module, sc, to_jsonb(p_answers));

  left_after := s.quiz_max_attempts - used - 1;
  reveal := sc >= s.quiz_pass_mark or left_after = 0;
  if not reveal then
    select coalesce(jsonb_agg(r - 'explanation'), '[]') into results from jsonb_array_elements(results) r;
  end if;

  return jsonb_build_object(
    'score', sc, 'correct', correct, 'total', total,
    'passed', sc >= s.quiz_pass_mark, 'pass_mark', s.quiz_pass_mark,
    'attempts_left', left_after, 'results', results);
end $$;

-- ── Drill: intern submits, can edit until a mentor reviews ─────────
create function public.submit_drill(p_module uuid, p_answer text) returns public.drill_submissions
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); row public.drill_submissions;
begin
  if uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not exists (select 1 from public.modules where id = p_module and published and drill_prompt <> '') then
    raise exception 'MODULE_NOT_AVAILABLE';
  end if;
  if length(trim(coalesce(p_answer, ''))) < 20 then raise exception 'ANSWER_TOO_SHORT'; end if;
  if exists (select 1 from public.drill_submissions where user_id = uid and module_id = p_module and status = 'reviewed') then
    raise exception 'ALREADY_REVIEWED';
  end if;

  insert into public.drill_submissions (user_id, module_id, answer)
  values (uid, p_module, left(trim(p_answer), 20000))
  on conflict (user_id, module_id)
  do update set answer = excluded.answer, updated_at = now()
  returning * into row;
  return row;
end $$;

-- ── Mentor review ──────────────────────────────────────────────────
create function public.review_drill(p_submission uuid, p_score int, p_feedback text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'NOT_ALLOWED'; end if;
  if p_score is null or p_score < 0 or p_score > 100 then raise exception 'SCORE_OUT_OF_RANGE'; end if;
  update public.drill_submissions
     set status = 'reviewed', score = p_score, feedback = coalesce(p_feedback, ''),
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_submission;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

create function public.review_queue(p_include_reviewed boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'NOT_ALLOWED'; end if;
  return coalesce((
    select jsonb_agg(x order by x.status, x.submitted_at) from (
      select d.id, d.status, d.answer, d.score, d.feedback, d.updated_at submitted_at, d.reviewed_at,
             p.full_name intern_name, p.cohort, m.title module_title, m.week,
             m.drill_prompt, coalesce(mp.drill_guide, '') drill_guide,
             r.full_name reviewer_name
      from public.drill_submissions d
      join public.profiles p on p.id = d.user_id
      join public.modules m on m.id = d.module_id
      left join public.module_private mp on mp.module_id = m.id
      left join public.profiles r on r.id = d.reviewed_by
      where p_include_reviewed or d.status = 'submitted'
    ) x), '[]'::jsonb);
end $$;

-- ── Mentor roster ──────────────────────────────────────────────────
create function public.staff_roster() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'NOT_ALLOWED'; end if;
  return coalesce((
    select jsonb_agg(x order by x.score desc, x.full_name) from (
      select p.id, p.full_name, p.email, p.school, p.cohort, p.level_id, l.name level_name,
             st.score, st.quiz_avg, st.drill_avg, st.completion_pct, st.modules_completed,
             st.drills_passed, st.published_modules,
             (public.promotion_check(p.id)->>'ready')::boolean ready_for_next,
             public.promotion_check(p.id)->'next'->>'name' next_level,
             (select count(*) from public.drill_submissions d where d.user_id = p.id and d.status = 'submitted') pending_drills,
             (select max(t) from (
                select max(created_at) t from public.quiz_attempts where user_id = p.id
                union all select max(updated_at) from public.drill_submissions where user_id = p.id) z) last_active
      from public.profiles p
      left join public.levels l on l.id = p.level_id
      cross join lateral public.intern_stats(p.id) st
      where p.role = 'intern'
    ) x), '[]'::jsonb);
end $$;

create function public.set_level(p_user uuid, p_level int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'NOT_ALLOWED'; end if;
  if not exists (select 1 from public.levels where id = p_level) then raise exception 'NOT_FOUND'; end if;
  update public.profiles set level_id = p_level where id = p_user and role = 'intern';
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- ── Admin ──────────────────────────────────────────────────────────
create function public.admin_set_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  if p_role not in ('intern','mentor','admin') then raise exception 'BAD_ROLE'; end if;
  if p_role <> 'admin' and (select role from public.profiles where id = p_user) = 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'LAST_ADMIN';
  end if;
  update public.profiles set role = p_role where id = p_user;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

create function public.admin_set_cohort(p_user uuid, p_cohort text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  update public.profiles set cohort = left(trim(coalesce(p_cohort, '')), 60) where id = p_user;
end $$;

create function public.admin_get_module(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  return (
    select to_jsonb(m) || jsonb_build_object(
      'drill_guide', coalesce((select drill_guide from public.module_private where module_id = m.id), ''),
      'questions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'prompt', q.prompt, 'options', q.options, 'explanation', q.explanation,
          'correct_index', k.correct_index) order by q.position, q.id)
        from public.quiz_questions q left join public.quiz_answer_keys k on k.question_id = q.id
        where q.module_id = m.id), '[]'::jsonb))
    from public.modules m where m.id = p_id);
end $$;

-- Saves a module and its quiz in one go. Pass id = null to create.
create function public.admin_save_module(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  q jsonb; i int := 0; qid uuid; n_opts int; ci int;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  if length(trim(coalesce(p->>'title', ''))) = 0 then raise exception 'TITLE_REQUIRED'; end if;

  if v_id is null then
    insert into public.modules (week, position, title, objective, body, video_url, resource_url, drill_prompt, published)
    values (coalesce((p->>'week')::int, 1), coalesce((p->>'position')::int, 1), trim(p->>'title'),
            coalesce(p->>'objective', ''), coalesce(p->>'body', ''), coalesce(p->>'video_url', ''),
            coalesce(p->>'resource_url', ''), coalesce(p->>'drill_prompt', ''), coalesce((p->>'published')::boolean, false))
    returning id into v_id;
  else
    update public.modules set
      week = coalesce((p->>'week')::int, week), position = coalesce((p->>'position')::int, position),
      title = trim(p->>'title'), objective = coalesce(p->>'objective', ''), body = coalesce(p->>'body', ''),
      video_url = coalesce(p->>'video_url', ''), resource_url = coalesce(p->>'resource_url', ''),
      drill_prompt = coalesce(p->>'drill_prompt', ''), published = coalesce((p->>'published')::boolean, false),
      updated_at = now()
    where id = v_id;
    if not found then raise exception 'NOT_FOUND'; end if;
  end if;

  insert into public.module_private (module_id, drill_guide) values (v_id, coalesce(p->>'drill_guide', ''))
  on conflict (module_id) do update set drill_guide = excluded.drill_guide;

  if p ? 'questions' then
    delete from public.quiz_questions where module_id = v_id;
    for q in select * from jsonb_array_elements(p->'questions') loop
      i := i + 1;
      n_opts := jsonb_array_length(q->'options');
      ci := (q->>'correct_index')::int;
      if length(trim(coalesce(q->>'prompt', ''))) = 0 then raise exception 'QUESTION_%_NEEDS_TEXT', i; end if;
      if n_opts < 2 then raise exception 'QUESTION_%_NEEDS_TWO_OPTIONS', i; end if;
      if ci is null or ci < 0 or ci >= n_opts then raise exception 'QUESTION_%_NEEDS_CORRECT_ANSWER', i; end if;
      insert into public.quiz_questions (module_id, position, prompt, options, explanation)
      values (v_id, i, trim(q->>'prompt'), q->'options', coalesce(q->>'explanation', ''))
      returning id into qid;
      insert into public.quiz_answer_keys (question_id, correct_index) values (qid, ci);
    end loop;
  end if;
  return v_id;
end $$;

-- Project Apex · 003: row-level security and grants
-- Default deny. The browser only ever holds the publishable key plus the
-- signed-in user's session; everything below decides what that can do.

alter table public.app_settings      enable row level security;
alter table public.levels            enable row level security;
alter table public.profiles          enable row level security;
alter table public.invite_codes      enable row level security;
alter table public.modules           enable row level security;
alter table public.module_private    enable row level security;
alter table public.quiz_questions    enable row level security;
alter table public.quiz_answer_keys  enable row level security;
alter table public.quiz_attempts     enable row level security;
alter table public.drill_submissions enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Settings and ladder: everyone signed in reads, admins write
grant select on public.app_settings, public.levels to authenticated;
grant update (weight_quiz, weight_drill, weight_completion, quiz_pass_mark, drill_pass_mark, quiz_max_attempts, updated_at)
  on public.app_settings to authenticated;
grant insert, update, delete on public.levels to authenticated;
grant usage on sequence public.levels_id_seq to authenticated;

create policy settings_read on public.app_settings for select to authenticated using (true);
create policy settings_admin on public.app_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy levels_read on public.levels for select to authenticated using (true);
create policy levels_admin_ins on public.levels for insert to authenticated with check (public.is_admin());
create policy levels_admin_upd on public.levels for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy levels_admin_del on public.levels for delete to authenticated using (public.is_admin());

-- Profiles: you see yourself; staff see everyone. You can edit only your name and school.
grant select on public.profiles to authenticated;
grant update (full_name, school) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Invite codes: admins only
grant select, insert, update, delete on public.invite_codes to authenticated;
create policy invites_admin on public.invite_codes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Content: published modules for everyone signed in; drafts for staff; admins write
grant select on public.modules, public.quiz_questions to authenticated;
grant insert, update, delete on public.modules, public.quiz_questions to authenticated;
create policy modules_read on public.modules for select to authenticated
  using (published or public.is_staff());
create policy modules_admin_ins on public.modules for insert to authenticated with check (public.is_admin());
create policy modules_admin_upd on public.modules for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy modules_admin_del on public.modules for delete to authenticated using (public.is_admin());

create policy questions_read on public.quiz_questions for select to authenticated
  using (public.is_staff() or exists (select 1 from public.modules m where m.id = module_id and m.published));
create policy questions_admin_ins on public.quiz_questions for insert to authenticated with check (public.is_admin());
create policy questions_admin_upd on public.quiz_questions for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy questions_admin_del on public.quiz_questions for delete to authenticated using (public.is_admin());

grant select on public.module_private to authenticated;
create policy private_staff_read on public.module_private for select to authenticated using (public.is_staff());

grant select on public.quiz_answer_keys to authenticated;
create policy keys_admin_read on public.quiz_answer_keys for select to authenticated using (public.is_admin());

-- Intern work: read your own (staff read all). No direct writes at all.
grant select on public.quiz_attempts, public.drill_submissions to authenticated;
create policy attempts_read on public.quiz_attempts for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy drills_read on public.drill_submissions for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

-- Functions: lock everything, then open only what the app calls
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.check_invite_code(text) to anon, authenticated;
grant execute on function
  public.my_role(), public.is_staff(), public.is_admin(),
  public.my_dashboard(), public.my_modules(), public.leaderboard(text),
  public.submit_quiz(uuid, int[]), public.submit_drill(uuid, text),
  public.review_drill(uuid, int, text), public.review_queue(boolean),
  public.staff_roster(), public.set_level(uuid, int),
  public.admin_set_role(uuid, text), public.admin_set_cohort(uuid, text),
  public.admin_get_module(uuid), public.admin_save_module(jsonb)
to authenticated;

-- Internal only (called by the functions above, never by the browser):
-- module_status, intern_stats, promotion_check, handle_new_user

-- Project Apex · seed: starter ladder, one sample module, first admin code
-- Run once after the three migrations. Edit everything later in the Admin pages.

insert into public.levels (rank, name, description, min_score, min_modules, min_drills_passed) values
  (1, 'Apprentice',       'Starting level for every intern.',                         0, 0, 0),
  (2, 'Desk Assistant',   'Has the basics: sizing, orders, journaling.',             300, 2, 1),
  (3, 'Junior Trader',    'Trades the sim book within risk rules.',                  550, 5, 4),
  (4, 'Associate Trader', 'Consistent process; ready for a trader-track interview.', 750, 8, 7);

-- Sample module so the app isn't empty. Replace or unpublish it in Admin → Modules.
with m as (
  insert into public.modules (week, position, title, objective, body, drill_prompt, published)
  values (
    1, 1,
    'Sample: Position sizing basics',
    'Size any trade so that hitting your stop costs a fixed, pre-decided share of the account.',
    E'Every trade starts with one question: how much am I willing to lose if I am wrong?\n\n'
    'Risk per trade = account size × risk %. On a ₱1,000,000 account risking 1%, that is ₱10,000.\n\n'
    'Risk per share = entry price − stop price. Buying at ₱50.00 with a stop at ₱48.00 risks ₱2.00 a share.\n\n'
    'Shares = risk per trade ÷ risk per share. ₱10,000 ÷ ₱2.00 = 5,000 shares. Round down to a whole board lot.\n\n'
    'The stop goes where the trade idea is proven wrong, not where the loss feels comfortable. '
    'If the right stop is far away, you buy fewer shares. You never move the stop to buy more.',
    'Your sim book has ₱10,000,000 and a 0.5% risk budget per trade. A stock you like is trading at ₱28.00 '
    'after a pullback. Write down: (1) your entry, (2) your stop and why it sits there, (3) how many shares you buy, '
    'with the math shown, and (4) what would make you cancel the trade before entry.',
    true)
  returning id
),
g as (
  insert into public.module_private (module_id, drill_guide)
  select id,
    'Risk budget is ₱50,000. Stop should sit at a level that invalidates the idea (recent swing low or support), '
    'not an arbitrary %. Example: stop ₱26.60 → ₱1.40 risk/share → about 35,700 shares, rounded down to a board lot. '
    'Full marks need correct math, a reasoned stop, rounding down, and a clear cancel condition.'
  from m
),
q as (
  insert into public.quiz_questions (module_id, position, prompt, options, explanation)
  select m.id, v.pos, v.prompt, v.opts::jsonb, v.expl from m, (values
    (1, 'Account ₱1,000,000, risk 1% per trade, entry ₱50.00, stop ₱48.00. What is the most you can buy?',
        '["2,000 shares","5,000 shares","10,000 shares","20,000 shares"]',
        '₱10,000 risk ÷ ₱2.00 risk per share = 5,000 shares.'),
    (2, 'Your proper stop is further away than you hoped. With the same risk budget, your position size should…',
        '["Increase","Decrease","Stay the same","Depend on the news flow"]',
        'More risk per share means fewer shares for the same peso risk.'),
    (3, 'What is a stop-loss for?',
        '["Guaranteeing a profit","Capping the loss on a trade at a level chosen in advance","Avoiding broker fees","Adding leverage"]',
        'It defines, before entry, where the idea is wrong and how much that costs.'),
    (4, 'Risking 1% per trade, five losses in a row cost the account about…',
        '["1%","5%","10%","25%"]',
        'Roughly 5% (a little less, since each loss is 1% of a smaller balance).'),
    (5, 'Entry ₱100, stop ₱95, target ₱115. What is the reward-to-risk?',
        '["1 : 3","2 : 1","3 : 1","1.5 : 1"]',
        'Reward ₱15 ÷ risk ₱5 = 3 : 1.')
  ) as v(pos, prompt, opts, expl)
  returning id, position
)
insert into public.quiz_answer_keys (question_id, correct_index)
select q.id, k.ci from q join (values (1,1),(2,1),(3,1),(4,1),(5,2)) as k(pos, ci) on k.pos = q.position;

-- First admin invite code. Copy it from the result below and use it to sign up.
insert into public.invite_codes (code, role, cohort, max_uses, note)
values ('ADMIN-' || upper(substr(md5(random()::text), 1, 8)), 'admin', '', 2, 'First admin accounts');

select code as "Your admin invite code" from public.invite_codes where role = 'admin' order by created_at desc limit 1;

