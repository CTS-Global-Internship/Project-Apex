import { useState } from 'react';
import { rpc } from '../lib/supabase';
import { useLoad } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { Loading, ErrorNote, PageHead, Panel, Bar, Empty } from '../components/ui';

interface Row { user_id: string; full_name: string; cohort: string; level_name: string | null; score: number; modules_completed: number; completion_pct: number; rank: number }

export default function Leaderboard() {
  const { profile } = useAuth();
  const [scope, setScope] = useState<'batch' | 'all'>(profile?.cohort ? 'batch' : 'all');
  const { data, error, loading, reload } = useLoad(
    () => rpc<Row[]>('leaderboard', { p_cohort: scope === 'batch' ? profile?.cohort ?? null : null }), [scope]);

  return (
    <>
      <PageHead eyebrow="Standings" title="Leaderboard">
        {profile?.cohort && (
          <div className="row" role="group" aria-label="Scope">
            <button className={`btn sm ${scope === 'batch' ? '' : 'ghost'}`} onClick={() => setScope('batch')}>Batch {profile.cohort}</button>
            <button className={`btn sm ${scope === 'all' ? '' : 'ghost'}`} onClick={() => setScope('all')}>All interns</button>
          </div>
        )}
      </PageHead>
      <Panel>
        {loading ? <Loading /> : error ? <ErrorNote message={error} onRetry={reload} /> : !data?.length ? (
          <Empty title="No interns yet">Rankings appear once interns join and start modules.</Empty>
        ) : (
          <div className="tbl">
            <table>
              <thead><tr><th className="r">#</th><th>Intern</th><th>Level</th><th className="r">Apex Score</th><th style={{ width: '22%' }}>Progress</th><th className="r">Modules</th></tr></thead>
              <tbody>
                {data.map(r => (
                  <tr key={r.user_id} className={r.user_id === profile?.id ? 'me' : ''}>
                    <td className="r num">{r.rank}</td>
                    <td>{r.full_name || 'Unnamed'}{r.user_id === profile?.id && ' (you)'}{scope === 'all' && r.cohort && <span className="muted"> · {r.cohort}</span>}</td>
                    <td>{r.level_name ?? '—'}</td>
                    <td className="r num">{r.score}</td>
                    <td><Bar value={r.score} max={1000} /></td>
                    <td className="r num">{r.modules_completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="note">Apex Score blends quiz results, mentor-scored drills and modules completed. Admins set the weights.</p>
      </Panel>
    </>
  );
}
