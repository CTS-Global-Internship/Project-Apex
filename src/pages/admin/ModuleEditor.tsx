import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { rpc, supabase } from '../../lib/supabase';
import { Loading, ErrorNote, PageHead, Panel } from '../../components/ui';

interface Q { prompt: string; options: string[]; correct_index: number | null; explanation: string }
interface Draft {
  id: string | null; week: number; position: number; title: string; objective: string; body: string;
  video_url: string; resource_url: string; drill_prompt: string; drill_guide: string; published: boolean; questions: Q[];
}

const blankQ = (): Q => ({ prompt: '', options: ['', '', '', ''], correct_index: null, explanation: '' });
const blank: Draft = { id: null, week: 1, position: 1, title: '', objective: '', body: '', video_url: '', resource_url: '', drill_prompt: '', drill_guide: '', published: false, questions: [] };

export default function ModuleEditor() {
  const { id } = useParams();
  const isNew = id === 'new';
  const nav = useNavigate();
  const [d, setD] = useState<Draft | null>(isNew ? blank : null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isNew) { setD(blank); return; }
    rpc<Draft & { questions: Q[] }>('admin_get_module', { p_id: id })
      .then(m => m ? setD({ ...blank, ...m }) : setError('Module not found.'))
      .catch(e => setError(e.message));
  }, [id, isNew]);

  if (!d) return error ? <ErrorNote message={error} /> : <Loading />;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setD({ ...d, [k]: v }); setSaved(''); };
  const setQ = (i: number, q: Partial<Q>) => set('questions', d.questions.map((x, j) => (j === i ? { ...x, ...q } : x)));

  async function save(publish?: boolean) {
    setBusy(true); setError(''); setSaved('');
    const questions = d!.questions.map(q => {
      // drop blank options but keep the correct answer pointing at the same text
      const keep = q.options.map((o, i) => ({ o: o.trim(), i })).filter(x => x.o);
      return { prompt: q.prompt, explanation: q.explanation, options: keep.map(x => x.o), correct_index: keep.findIndex(x => x.i === q.correct_index) };
    });
    try {
      const newId = await rpc<string>('admin_save_module', { p: { ...d, published: publish ?? d!.published, questions } });
      if (publish !== undefined) setD({ ...d!, published: publish });
      setSaved(publish === true ? 'Published. Interns can see it now.' : publish === false ? 'Unpublished. Interns no longer see it.' : 'Saved.');
      if (isNew) nav(`/admin/modules/${newId}`, { replace: true });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }

  async function remove() {
    const { error } = await supabase.from('modules').delete().eq('id', d!.id!);
    if (error) setError(error.message); else nav('/admin/modules');
  }

  return (
    <>
      <div><Link to="/admin/modules" className="note">← All modules</Link></div>
      <PageHead eyebrow={isNew ? 'New module' : d.published ? 'Published' : 'Draft'} title={d.title || 'Untitled module'}>
        <button className="btn ghost" disabled={busy} onClick={() => save()}>Save</button>
        {d.published
          ? <button className="btn ghost" disabled={busy} onClick={() => save(false)}>Unpublish</button>
          : <button className="btn amber" disabled={busy} onClick={() => save(true)}>Save &amp; publish</button>}
      </PageHead>
      {error && <div className="alert err" role="alert">{error}</div>}
      {saved && <div className="alert ok" role="status">{saved}</div>}

      <div className="grid">
        <div className="c8 stack" style={{ gap: 16 }}>
          <Panel title="1 · The workshop">
            <div className="form-grid">
              <label className="field full">Title<input id="me-title" value={d.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Reading the order book" /></label>
              <label className="field full">Objective <span className="hint">— the one thing an intern can do after this</span>
                <input id="me-obj" value={d.objective} onChange={e => set('objective', e.target.value)} placeholder="e.g. Read bid/ask depth and spot where size is sitting." /></label>
              <label className="field full">Notes / reading <span className="hint">— plain text; blank lines start new paragraphs</span>
                <textarea id="me-body" rows={10} value={d.body} onChange={e => set('body', e.target.value)} /></label>
              <label className="field"><span>Video link <span className="hint">— YouTube plays inside the page</span></span><input id="me-video" value={d.video_url} onChange={e => set('video_url', e.target.value)} placeholder="https://youtu.be/…" /></label>
              <label className="field">Slides or reading link<input id="me-res" value={d.resource_url} onChange={e => set('resource_url', e.target.value)} placeholder="Google Slides, PDF, Drive…" /></label>
            </div>
          </Panel>

          <Panel title="2 · Quiz" meta="Auto-scored. Interns never see the correct answers.">
            {d.questions.length === 0 && <p className="note">No questions yet. A module without a quiz is completed by submitting its drill.</p>}
            {d.questions.map((q, i) => (
              <div key={i} className="qedit">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b>Question {i + 1}</b>
                  <div className="row">
                    <button className="btn sm ghost" disabled={i === 0} onClick={() => { const a = [...d.questions]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set('questions', a); }} aria-label="Move up">↑</button>
                    <button className="btn sm danger" onClick={() => set('questions', d.questions.filter((_, j) => j !== i))}>Remove</button>
                  </div>
                </div>
                <input id={`q${i}-prompt`} value={q.prompt} onChange={e => setQ(i, { prompt: e.target.value })} placeholder="Question" aria-label={`Question ${i + 1} text`} />
                <span className="note">Tick the correct answer:</span>
                {q.options.map((o, oi) => (
                  <div key={oi} className="optrow">
                    <input type="radio" name={`correct-${i}`} id={`q${i}-c${oi}`} checked={q.correct_index === oi} onChange={() => setQ(i, { correct_index: oi })} aria-label={`Option ${oi + 1} is correct`} />
                    <input id={`q${i}-o${oi}`} value={o} onChange={e => setQ(i, { options: q.options.map((x, j) => (j === oi ? e.target.value : x)) })} placeholder={`Option ${oi + 1}`} />
                    <button className="btn sm ghost" disabled={q.options.length <= 2} onClick={() => setQ(i, { options: q.options.filter((_, j) => j !== oi), correct_index: q.correct_index === oi ? null : q.correct_index !== null && q.correct_index > oi ? q.correct_index - 1 : q.correct_index })} aria-label="Remove option">×</button>
                  </div>
                ))}
                {q.options.length < 6 && <div><button className="btn sm ghost" onClick={() => setQ(i, { options: [...q.options, ''] })}>+ Option</button></div>}
                <input id={`q${i}-expl`} value={q.explanation} onChange={e => setQ(i, { explanation: e.target.value })} placeholder="Why this is the answer (shown once they pass)" aria-label="Explanation" />
              </div>
            ))}
            <div><button className="btn ghost" onClick={() => set('questions', [...d.questions, blankQ()])}>+ Add question</button></div>
          </Panel>

          <Panel title="3 · Drill" meta="Optional. Interns write an answer; a mentor scores it out of 100.">
            <label className="field">Drill prompt<textarea id="me-drill" rows={5} value={d.drill_prompt} onChange={e => set('drill_prompt', e.target.value)} placeholder="A short case or task. Leave blank for no drill." /></label>
            <label className="field"><span>What a good answer looks like <span className="hint">— mentors only</span></span><textarea id="me-guide" rows={4} value={d.drill_guide} onChange={e => set('drill_guide', e.target.value)} /></label>
          </Panel>
        </div>

        <div className="c4 stack">
          <Panel title="Placement">
            <div className="form-grid">
              <label className="field">Week<input id="me-week" type="number" min={1} max={52} value={d.week} onChange={e => set('week', Number(e.target.value) || 1)} /></label>
              <label className="field">Order in week<input id="me-pos" type="number" min={1} value={d.position} onChange={e => set('position', Number(e.target.value) || 1)} /></label>
            </div>
          </Panel>
          {!isNew && (
            <Panel title="Delete">
              <p className="note">Deleting removes the module and every intern’s quiz attempts and drill answers for it. To hide it instead, unpublish.</p>
              {confirmDelete
                ? <div className="row"><button className="btn danger" onClick={remove}>Yes, delete for good</button><button className="btn ghost" onClick={() => setConfirmDelete(false)}>Cancel</button></div>
                : <div><button className="btn danger" onClick={() => setConfirmDelete(true)}>Delete module</button></div>}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
