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
