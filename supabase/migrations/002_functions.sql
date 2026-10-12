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
