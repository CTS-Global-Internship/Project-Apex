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
