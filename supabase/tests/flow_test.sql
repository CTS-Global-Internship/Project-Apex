-- End-to-end database test. Runs against a local Postgres with supabase/tests/auth_stub.sql
-- loaded first, then the migrations and seed. Every check raises on failure.
\set ON_ERROR_STOP 1

-- Accounts: admin via the seeded code, an intern code, two interns, one mentor
insert into auth.users (id, email, raw_user_meta_data)
select '00000000-0000-0000-0000-00000000000a', 'admin@cts.test',
       jsonb_build_object('full_name','Edmund A.','invite_code', lower(code))
from public.invite_codes where role = 'admin';

insert into public.invite_codes (code, role, cohort, max_uses) values ('BATCH26B', 'intern', '2026-B', 2), ('MENTOR1', 'mentor', '', 1);

insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000b1','bea@test','{"full_name":"Bea S.","school":"UP","invite_code":"batch26b"}'),
 ('00000000-0000-0000-0000-0000000000b2','marco@test','{"full_name":"Marco D.","invite_code":"BATCH26B"}'),
 ('00000000-0000-0000-0000-0000000000c1','mentor@test','{"full_name":"Ms. Reyes","invite_code":"MENTOR1"}');

do $$ begin
  -- code exhausted → sign-up refused
  begin
    insert into auth.users (email, raw_user_meta_data) values ('x@test','{"invite_code":"BATCH26B"}');
    raise exception 'FAIL: used-up code accepted';
  exception when others then if sqlerrm not like '%INVALID_INVITE_CODE%' then raise; end if; end;
  begin
    insert into auth.users (email, raw_user_meta_data) values ('y@test','{}');
    raise exception 'FAIL: missing code accepted';
  exception when others then if sqlerrm not like '%INVALID_INVITE_CODE%' then raise; end if; end;
  assert (select role from public.profiles where email='admin@cts.test') = 'admin', 'admin role';
  assert (select cohort from public.profiles where email='bea@test') = '2026-B', 'cohort';
  assert (select l.name from public.profiles p join public.levels l on l.id=p.level_id where email='bea@test') = 'Apprentice', 'start level';
end $$;

-- ── As intern Bea ──────────────────────────────────────────────────
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1', false);

do $$
declare mid uuid; r jsonb; d jsonb; n int;
begin
  select module_id into mid from public.my_modules() limit 1;
  assert mid is not null, 'intern sees published module';

  -- cannot read answer keys, drill guide, other profiles, invite codes
  select count(*) into n from public.quiz_answer_keys; assert n = 0, 'keys hidden';
  select count(*) into n from public.module_private;   assert n = 0, 'guide hidden';
  select count(*) into n from public.profiles;         assert n = 1, 'only own profile';
  select count(*) into n from public.invite_codes;     assert n = 0, 'codes hidden';

  -- tamper attempts
  begin update public.profiles set role='admin' where id=auth.uid(); raise exception 'FAIL role edit';
  exception when insufficient_privilege then null; end;
  begin insert into public.quiz_attempts(user_id,module_id,score) values (auth.uid(),mid,100); raise exception 'FAIL forge attempt';
  exception when insufficient_privilege then null; end;
  begin update public.drill_submissions set score=100; raise exception 'FAIL forge drill';
  exception when insufficient_privilege then null; end;
  begin perform public.review_drill(gen_random_uuid(),100,''); raise exception 'FAIL self review';
  exception when others then if sqlerrm <> 'NOT_ALLOWED' then raise; end if; end;
  begin perform public.admin_save_module('{"title":"x"}'); raise exception 'FAIL admin save';
  exception when others then if sqlerrm <> 'NOT_ALLOWED' then raise; end if; end;
  begin perform public.intern_stats(auth.uid()); raise exception 'FAIL internal fn exposed';
  exception when insufficient_privilege then null; end;

  update public.profiles set full_name = 'Bea Santos' where id = auth.uid();

  -- quiz: first attempt 3/5 (fails, no explanations), second 5/5
  r := public.submit_quiz(mid, array[1,1,1,0,0]);
  assert (r->>'score')::numeric = 60 and not (r->>'passed')::boolean, 'quiz 60';
  assert not (r->'results'->0 ? 'explanation'), 'explanations hidden on fail';
  r := public.submit_quiz(mid, array[1,1,1,1,2]);
  assert (r->>'score')::numeric = 100 and (r->>'attempts_left')::int = 1, 'quiz 100';
  assert (r->'results'->0 ? 'explanation'), 'explanations shown on pass';

  begin perform public.submit_drill(mid, 'too short'); raise exception 'FAIL short';
  exception when others then if sqlerrm <> 'ANSWER_TOO_SHORT' then raise; end if; end;
  perform public.submit_drill(mid, 'Entry 28.00, stop 26.60 under the swing low, 35,700 shares rounded down to board lot.');
  perform public.submit_drill(mid, 'Edited: entry 28.00, stop 26.60 under the swing low; 50,000 / 1.40 = 35,714 → 35,700 shares.');

  d := public.my_dashboard();
  assert (d->'stats'->>'modules_completed')::int = 1, 'completed';
  -- score = 10*(40*100 + 40*0 + 20*100)/100 = 600
  assert (d->'stats'->>'score')::int = 600, 'score 600, got ' || (d->'stats'->>'score');
  assert (d->>'rank')::int = 1, 'rank 1';
  assert jsonb_array_length(d->'activity') = 3, 'activity';
end $$;

-- ── As mentor ──────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1', false);
do $$
declare q jsonb; ros jsonb; n int;
begin
  q := public.review_queue();
  assert jsonb_array_length(q) = 1 and q->0->>'drill_guide' like 'Risk budget%', 'queue with guide';
  perform public.review_drill((q->0->>'id')::uuid, 85, 'Clean math. Name the swing low price next time.');
  ros := public.staff_roster();
  assert jsonb_array_length(ros) = 2, 'roster has 2 interns';
  select count(*) into n from public.quiz_answer_keys; assert n = 0, 'mentor cannot read keys';
  begin perform public.admin_set_role('00000000-0000-0000-0000-0000000000b2','admin'); raise exception 'FAIL mentor promote role';
  exception when others then if sqlerrm <> 'NOT_ALLOWED' then raise; end if; end;
end $$;

-- ── Back as Bea: drill locked, score updated ───────────────────────
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1', false);
do $$
declare mid uuid; d jsonb;
begin
  select module_id into mid from public.my_modules() limit 1;
  begin perform public.submit_drill(mid, 'Trying to change my answer after review, which is not allowed.'); raise exception 'FAIL edit after review';
  exception when others then if sqlerrm <> 'ALREADY_REVIEWED' then raise; end if; end;
  d := public.my_dashboard();
  -- 10*(40*100 + 40*85 + 20*100)/100 = 940
  assert (d->'stats'->>'score')::int = 940, 'score 940, got ' || (d->'stats'->>'score');
  assert (d->'stats'->>'drills_passed')::int = 1, 'drill passed';
  -- Desk Assistant needs 2 modules; only 1 published so far
  assert not (d->'promotion'->>'ready')::boolean, 'not yet ready';
  assert d->'promotion'->'next'->>'name' = 'Desk Assistant', 'next rung';
end $$;

-- ── As admin ───────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);
do $$
declare mid uuid; m jsonb; n int; lb int;
begin
  mid := public.admin_save_module(jsonb_build_object(
    'title','Week 2: Reading the order book','week',2,'published',true,
    'drill_prompt','Describe the bid-ask on a stock of your choice in at least two sentences.',
    'drill_guide','Look for depth, spread, and who is likely on each side.',
    'questions', jsonb_build_array(
      jsonb_build_object('prompt','The best bid is…','options',jsonb_build_array('Highest price a buyer is offering','Lowest ask'),'correct_index',0))));
  m := public.admin_get_module(mid);
  assert jsonb_array_length(m->'questions') = 1 and (m->'questions'->0->>'correct_index')::int = 0, 'round trip';
  begin perform public.admin_save_module(jsonb_build_object('id',mid,'title','x','questions',
      jsonb_build_array(jsonb_build_object('prompt','q','options',jsonb_build_array('a','b'),'correct_index',5))));
    raise exception 'FAIL bad key';
  exception when others then if sqlerrm not like 'QUESTION_1_NEEDS_CORRECT_ANSWER' then raise; end if; end;
  begin perform public.admin_set_role('00000000-0000-0000-0000-00000000000a','intern'); raise exception 'FAIL last admin';
  exception when others then if sqlerrm <> 'LAST_ADMIN' then raise; end if; end;
  update public.app_settings set weight_completion = 0, updated_at = now() where id = 1;
  select count(*) into n from public.invite_codes; assert n = 3, 'admin sees codes';
  perform public.set_level('00000000-0000-0000-0000-0000000000b1', (select id from public.levels where rank = 2));
  select count(*) into lb from public.leaderboard('2026-B'); assert lb = 2, 'leaderboard cohort';
end $$;

-- Anonymous visitor
reset role;
set role anon;
select set_config('request.jwt.claim.sub','', false);
do $$ begin
  assert public.check_invite_code('batch26b') = false, 'exhausted code reports invalid';
  begin perform count(*) from public.modules; raise exception 'FAIL anon read';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'ALL DATABASE CHECKS PASSED' as result;
