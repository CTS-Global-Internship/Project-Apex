import { Link } from 'react-router-dom';
import { rpc } from '../lib/supabase';
import { useLoad, fmtDate, firstName, greeting } from '../lib/hooks';
import type { Dashboard as D } from '../lib/types';
import { Loading, ErrorNote, Panel, PageHead, Empty } from '../components/ui';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

export default function Dashboard() {
  const { profile } = useAuth();
  const { data, error, loading, reload } = useLoad(() => rpc<D>('my_dashboard'));
  const levels = useLoad(async () => (await supabase.from('levels').select('id,rank,name').order('rank')).data ?? []);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorNote message={error ?? 'Could not load your dashboard.'} onRetry={reload} />;

  const { stats, promotion, next_module: next } = data;
  const isIntern = profile?.role === 'intern';
  const curRank = promotion.current?.rank ?? 1;

  return (
    <>
      <PageHead
        eyebrow={[promotion.current?.name, data.profile.cohort && `Batch ${data.profile.cohort}`].filter(Boolean).join(' · ')}
        title={`${greeting()}, ${firstName(data.profile.full_name)}`}
      />

      {!isIntern && (
        <div className="alert info">You’re signed in as {profile?.role === 'admin' ? 'an admin' : 'a mentor'}. This page shows your own progress if you take modules; your intern overview is under <Link to="/mentor/interns">Interns</Link>.</div>
      )}

      <div className="kpis">
        <div className="kpi">
          <span className="lab">Apex Score</span>
          <span className="val num">{stats.score}<small>/1000</small></span>
          <span className="sub">Quizzes {Math.round(stats.quiz_avg)} · Drills {Math.round(stats.drill_avg)}</span>
        </div>
        <div className="kpi">
          <span className="lab">Batch rank</span>
          <span className="val num">{data.rank ? `#${data.rank}` : '—'}<small>{data.cohort_size ? ` of ${data.cohort_size}` : ''}</small></span>
          <span className="sub">{data.rank ? 'Among interns in your batch' : 'Ranks show once you have a score'}</span>
        </div>
        <div className="kpi">
          <span className="lab">Modules done</span>
          <span className="val num">{stats.modules_completed}<small> of {stats.published_modules}</small></span>
          <span className="sub">{Math.round(stats.completion_pct)}% of published modules</span>
        </div>
        <div className="kpi">
          <span className="lab">Drills passed</span>
          <span className="val num">{stats.drills_passed}</span>
          <span className="sub">Mentor score {data.settings.drill_pass_mark}+ counts as a pass</span>
        </div>
      </div>

      <div className="grid">
        <Panel className="c7" title="Promotion track" meta={promotion.next ? `Next: ${promotion.next.name}` : 'Top level reached'}>
          <div className="ladder">
            {(levels.data ?? []).map(l => (
              <div key={l.id} className={`rung ${l.rank < curRank ? 'done' : l.rank === curRank ? 'now' : ''}`}><i /><span>{l.name}</span></div>
            ))}
          </div>
          {promotion.next ? (
            <>
              <ul className="checks">
                {promotion.checks.map(c => {
                  const ok = c.have >= c.need;
                  return (
                    <li key={c.label}>
                      <span className={`chk ${ok ? 'ok' : 'no'}`}>{ok ? '✓' : ''}</span>
                      <span>{c.label === 'Apex Score' ? `Apex Score of ${c.need}+` : `${c.need} ${c.label.toLowerCase()}`}</span>
                      <span className="mono muted">{c.have} / {c.need}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="note">
                {promotion.ready
                  ? `You meet every requirement for ${promotion.next.name}. A mentor will confirm your promotion.`
                  : promotion.next.description || 'Meet every requirement and a mentor will confirm your promotion.'}
              </p>
            </>
          ) : <p className="note">You’ve reached the top of the ladder.</p>}
        </Panel>

        <Panel className="c5" title="Up next">
          {next ? (
            <>
              <div className="next">
                <span className="eyebrow" style={{ color: 'var(--warn)' }}>Week {next.week}</span>
                <h3>{next.title}</h3>
                {next.objective && <p className="note" style={{ color: 'var(--ink)' }}>{next.objective}</p>}
                <div className="row">
                  {next.has_quiz && <span className="pill">{next.question_count}-question quiz</span>}
                  {next.has_drill && <span className="pill">Drill</span>}
                  {next.drill_status === 'submitted' && <span className="pill a">Drill in review</span>}
                </div>
              </div>
              <Link to={`/learn/${next.module_id}`} className="btn">{next.attempts_used > 0 || next.drill_status ? 'Continue module' : 'Start module'}</Link>
            </>
          ) : stats.published_modules === 0
            ? <Empty title="No modules yet">Your program lead hasn’t published any modules.</Empty>
            : <Empty title="You’re all caught up">Every published module is done. New ones appear here as they’re released.</Empty>}
        </Panel>

        <Panel className="c12" title="Recent activity">
          {data.activity.length === 0 ? <p className="note">Nothing yet. Finish a quiz or submit a drill and it shows up here.</p> : (
            <ul className="feed">
              {data.activity.map((a, i) => (
                <li key={i}>
                  <time>{fmtDate(a.at)}</time>
                  <span>{a.kind === 'quiz' ? 'Quiz' : 'Drill'} · {a.title}</span>
                  {a.kind === 'quiz'
                    ? <span className={`pill ${(a.value ?? 0) >= data.settings.quiz_pass_mark ? 'g' : 'r'}`}>{a.value}%</span>
                    : a.status === 'reviewed'
                      ? <span className={`pill ${(a.value ?? 0) >= data.settings.drill_pass_mark ? 'g' : 'r'}`}>{a.value} / 100</span>
                      : <span className="pill a">In review</span>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
