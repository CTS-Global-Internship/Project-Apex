import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useLoad } from '../../lib/hooks';
import type { Module } from '../../lib/types';
import { Loading, ErrorNote, PageHead, Empty } from '../../components/ui';

type Row = Module & { quiz_questions: { count: number }[] };

export default function AdminModules() {
  const { data, error, loading, reload } = useLoad(async () => {
    const { data, error } = await supabase.from('modules').select('*, quiz_questions(count)').order('week').order('position').order('title');
    if (error) throw new Error(error.message);
    return data as Row[];
  });

  return (
    <>
      <PageHead eyebrow="Admin" title="Modules">
        <Link to="/admin/modules/new" className="btn amber">+ New module</Link>
      </PageHead>
      <p className="note">Each module is one workshop: the material, a short quiz, and an optional drill a mentor scores. Interns only see published modules.</p>
      {loading ? <Loading /> : error ? <ErrorNote message={error} onRetry={reload} /> : !data?.length ? (
        <Empty title="No modules yet"><Link to="/admin/modules/new" className="btn">Create your first module</Link></Empty>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {data.map(m => (
            <Link key={m.id} to={`/admin/modules/${m.id}`} className="mod" style={{ gridTemplateColumns: '64px minmax(0,1fr) auto' }}>
              <span className="mono muted">Wk {m.week}·{m.position}</span>
              <div style={{ minWidth: 0 }}><b>{m.title}</b>{m.objective && <p>{m.objective}</p>}</div>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <span className="pill">{m.quiz_questions?.[0]?.count ?? 0} questions</span>
                {m.drill_prompt && <span className="pill">Drill</span>}
                {m.published ? <span className="pill g">Published</span> : <span className="pill a">Draft</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
