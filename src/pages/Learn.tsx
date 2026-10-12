import { Link } from 'react-router-dom';
import { rpc } from '../lib/supabase';
import { useLoad } from '../lib/hooks';
import type { ModuleStatus } from '../lib/types';
import { Loading, ErrorNote, PageHead, Empty, StatusPill, Bar } from '../components/ui';

export default function Learn() {
  const { data, error, loading, reload } = useLoad(() => rpc<ModuleStatus[]>('my_modules'));

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  const mods = data ?? [];
  const done = mods.filter(m => m.completed).length;
  const weeks = [...new Set(mods.map(m => m.week))].sort((a, b) => a - b);

  return (
    <>
      <PageHead eyebrow="Program" title="Learn">
        <span className="mono muted">{done} / {mods.length} done</span>
        <div style={{ width: 140 }}><Bar value={done} max={Math.max(mods.length, 1)} /></div>
      </PageHead>

      {mods.length === 0 && <Empty title="No modules published yet">Modules appear here week by week as your program lead releases them.</Empty>}

      {weeks.map(w => (
        <section key={w} className="week">
          <div className="eyebrow">Week {w}</div>
          {mods.filter(m => m.week === w).map(m => (
            <Link key={m.module_id} to={`/learn/${m.module_id}`} className="mod">
              <span className={`chk ${m.completed ? 'ok' : 'no'}`}>{m.completed ? '✓' : ''}</span>
              <div style={{ minWidth: 0 }}>
                <b>{m.title}</b>
                {m.objective && <p>{m.objective}</p>}
              </div>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                {m.quiz_best != null && <span className="pill n">Quiz {Math.round(m.quiz_best)}%</span>}
                {m.drill_score != null && <span className="pill n">Drill {m.drill_score}</span>}
                <StatusPill completed={m.completed} drill={m.drill_status} />
              </div>
            </Link>
          ))}
        </section>
      ))}
    </>
  );
}
