import { useMemo, useState } from 'react';
import { rpc, supabase } from '../../lib/supabase';
import { useLoad, fmtDate } from '../../lib/hooks';
import type { Level } from '../../lib/types';
import { Loading, ErrorNote, PageHead, Panel, Empty, Bar } from '../../components/ui';

interface Intern {
  id: string; full_name: string; email: string; school: string; cohort: string; level_id: number | null; level_name: string | null;
  score: number; quiz_avg: number; drill_avg: number; completion_pct: number; modules_completed: number; drills_passed: number;
  published_modules: number; ready_for_next: boolean; next_level: string | null; pending_drills: number; last_active: string | null;
}

export default function Interns() {
  const roster = useLoad(() => rpc<Intern[]>('staff_roster'));
  const levels = useLoad(async () => ((await supabase.from('levels').select('*').order('rank')).data ?? []) as Level[]);
  const [cohort, setCohort] = useState('');
  const [msg, setMsg] = useState('');

  const cohorts = useMemo(() => [...new Set((roster.data ?? []).map(r => r.cohort).filter(Boolean))].sort(), [roster.data]);
  const rows = (roster.data ?? []).filter(r => !cohort || r.cohort === cohort);
  const ready = rows.filter(r => r.ready_for_next);

  async function promote(r: Intern, levelId: number) {
    setMsg('');
    try { await rpc('set_level', { p_user: r.id, p_level: levelId }); setMsg(`${r.full_name} is now ${levels.data?.find(l => l.id === levelId)?.name}.`); roster.reload(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  }

  const stale = (iso: string | null) => !iso || Date.now() - new Date(iso).getTime() > 7 * 864e5;

  return (
    <>
      <PageHead eyebrow="Mentors" title="Interns">
        {cohorts.length > 0 && (
          <select id="cohort-filter" value={cohort} onChange={e => setCohort(e.target.value)} style={{ width: 'auto' }}>
            <option value="">All batches</option>
            {cohorts.map(c => <option key={c} value={c}>Batch {c}</option>)}
          </select>
        )}
      </PageHead>

      {roster.loading ? <Loading /> : roster.error ? <ErrorNote message={roster.error} onRetry={roster.reload} /> : (
        <>
          {msg && <div className="alert ok">{msg}</div>}
          {ready.length > 0 && (
            <Panel title="Ready for promotion" meta="Meets every requirement for the next level">
              <div className="stack" style={{ gap: 8 }}>
                {ready.map(r => {
                  const next = levels.data?.find(l => l.name === r.next_level);
                  return (
                    <div key={r.id} className="row" style={{ justifyContent: 'space-between' }}>
                      <span><b>{r.full_name}</b> <span className="muted">{r.level_name} → {r.next_level} · score {r.score}</span></span>
                      {next && <button className="btn sm amber" onClick={() => promote(r, next.id)}>Promote to {next.name}</button>}
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
          <Panel title={`${rows.length} intern${rows.length === 1 ? '' : 's'}`} meta="Sorted by Apex Score">
            {rows.length === 0 ? <Empty title="No interns yet">Create an intern invite code in Admin → Invite codes and share it with your batch.</Empty> : (
              <div className="tbl">
                <table>
                  <thead><tr><th>Intern</th><th>Batch</th><th>Level</th><th className="r">Score</th><th>Modules</th><th className="r">Quiz avg</th><th className="r">Drill avg</th><th>Last active</th><th>Set level</th></tr></thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id}>
                        <td><b>{r.full_name || r.email}</b><div className="note">{r.school || r.email}</div></td>
                        <td>{r.cohort || '—'}</td>
                        <td>{r.level_name ?? '—'} {r.ready_for_next && <span className="pill a">Ready</span>}</td>
                        <td className="r num">{r.score}</td>
                        <td style={{ minWidth: 120 }}><div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><Bar value={r.modules_completed} max={Math.max(r.published_modules, 1)} /><span className="mono note">{r.modules_completed}/{r.published_modules}</span></div></td>
                        <td className="r num">{Math.round(r.quiz_avg)}</td>
                        <td className="r num">{Math.round(r.drill_avg)}{r.pending_drills > 0 && <div className="note">{r.pending_drills} pending</div>}</td>
                        <td>{stale(r.last_active) ? <span className="pill r">{r.last_active ? fmtDate(r.last_active) : 'Never'}</span> : fmtDate(r.last_active)}</td>
                        <td>
                          <select id={`lvl-${r.id}`} value={r.level_id ?? ''} onChange={e => promote(r, Number(e.target.value))} style={{ width: 'auto' }} aria-label={`Level for ${r.full_name}`}>
                            {levels.data?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="note">A red “last active” means no quiz or drill activity in the past 7 days.</p>
          </Panel>
        </>
      )}
    </>
  );
}
