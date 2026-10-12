import { useState } from 'react';
import { rpc } from '../../lib/supabase';
import { useLoad, fmtDate } from '../../lib/hooks';
import { Loading, ErrorNote, PageHead, Empty } from '../../components/ui';

interface Sub {
  id: string; status: 'submitted' | 'reviewed'; answer: string; score: number | null; feedback: string;
  submitted_at: string; reviewed_at: string | null; intern_name: string; cohort: string;
  module_title: string; week: number; drill_prompt: string; drill_guide: string; reviewer_name: string | null;
}

export default function Review() {
  const [showAll, setShowAll] = useState(false);
  const { data, error, loading, reload } = useLoad(() => rpc<Sub[]>('review_queue', { p_include_reviewed: showAll }), [showAll]);
  const pending = (data ?? []).filter(s => s.status === 'submitted').length;

  return (
    <>
      <PageHead eyebrow="Mentors" title="Review drills">
        <label className="row note" style={{ gap: 6 }}>
          <input type="checkbox" id="rv-all" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Show reviewed
        </label>
      </PageHead>
      {loading ? <Loading /> : error ? <ErrorNote message={error} onRetry={reload} /> : (
        <>
          <p className="note">{pending === 0 ? 'Nothing waiting for review.' : `${pending} drill${pending === 1 ? '' : 's'} waiting, oldest first.`}</p>
          {!data?.length && <Empty title="Queue is clear">New drill submissions show up here.</Empty>}
          <div className="stack">{data?.map(s => <ReviewCard key={s.id} sub={s} onSaved={reload} />)}</div>
        </>
      )}
    </>
  );
}

function ReviewCard({ sub, onSaved }: { sub: Sub; onSaved: () => void }) {
  const [score, setScore] = useState<string>(sub.score?.toString() ?? '');
  const [feedback, setFeedback] = useState(sub.feedback);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(sub.status === 'submitted');

  async function save() {
    const n = Number(score);
    if (score === '' || !Number.isInteger(n) || n < 0 || n > 100) return setErr('Enter a whole-number score from 0 to 100.');
    setBusy(true); setErr('');
    try { await rpc('review_drill', { p_submission: sub.id, p_score: n, p_feedback: feedback }); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  return (
    <article className="sub-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><b>{sub.intern_name}</b> <span className="muted">· {sub.cohort || 'No batch'} · Week {sub.week}: {sub.module_title}</span></div>
        <div className="row">
          <span className="note">Submitted {fmtDate(sub.submitted_at)}</span>
          {sub.status === 'reviewed'
            ? <span className="pill g">{sub.score}/100 · {sub.reviewer_name ?? 'reviewed'}</span>
            : <span className="pill a">Waiting</span>}
          {sub.status === 'reviewed' && <button className="btn sm ghost" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Edit review'}</button>}
        </div>
      </div>
      {open && (
        <>
          <details><summary className="note" style={{ cursor: 'pointer' }}>Drill prompt</summary><p className="note" style={{ whiteSpace: 'pre-wrap' }}>{sub.drill_prompt}</p></details>
          <pre className="answer">{sub.answer}</pre>
          {sub.drill_guide && <p className="guide"><b>What good looks like:</b> {sub.drill_guide}</p>}
          <div className="form-grid" style={{ gridTemplateColumns: '120px minmax(0,1fr)' }}>
            <label className="field">Score / 100<input id={`sc-${sub.id}`} inputMode="numeric" value={score} onChange={e => setScore(e.target.value)} /></label>
            <label className="field">Feedback for the intern<textarea id={`fb-${sub.id}`} rows={3} style={{ minHeight: 70 }} value={feedback} onChange={e => setFeedback(e.target.value)} /></label>
          </div>
          {err && <div className="alert err">{err}</div>}
          <div><button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : sub.status === 'reviewed' ? 'Update review' : 'Save review'}</button></div>
        </>
      )}
    </article>
  );
}
