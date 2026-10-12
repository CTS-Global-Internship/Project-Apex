import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, rpc, friendlyError } from '../lib/supabase';
import { useLoad, fmtDate } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import type { Module, ModuleStatus, Question, Settings } from '../lib/types';
import { Loading, ErrorNote, Panel, PageHead, StatusPill } from '../components/ui';

interface QuizResult {
  score: number; correct: number; total: number; passed: boolean; pass_mark: number; attempts_left: number;
  results: { question_id: string; correct: boolean; explanation?: string }[];
}

function youtubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}

export default function ModulePage() {
  const { id } = useParams();
  const { profile } = useAuth();

  const mod = useLoad(async () => {
    const [m, q, st, s, d] = await Promise.all([
      supabase.from('modules').select('*').eq('id', id).maybeSingle(),
      supabase.from('quiz_questions').select('id,prompt,options,explanation,position').eq('module_id', id).order('position').order('id'),
      rpc<ModuleStatus[]>('my_modules'),
      supabase.from('app_settings').select('*').single(),
      supabase.from('drill_submissions').select('*').eq('module_id', id).eq('user_id', profile!.id).maybeSingle(),
    ]);
    if (m.error) throw new Error(m.error.message);
    return {
      module: m.data as Module | null,
      questions: (q.data ?? []) as Question[],
      status: st.find(x => x.module_id === id) ?? null,
      settings: s.data as Settings,
      drill: d.data as { answer: string; status: string; score: number | null; feedback: string; updated_at: string; reviewed_at: string | null } | null,
    };
  }, [id]);

  if (mod.loading) return <Loading />;
  if (mod.error) return <ErrorNote message={mod.error} onRetry={mod.reload} />;
  const data = mod.data!;
  if (!data.module) return <ErrorNote message="This module isn’t available. It may have been unpublished." />;
  const m = data.module;
  const embed = m.video_url ? youtubeEmbed(m.video_url) : null;

  return (
    <>
      <div><Link to="/learn" className="note">← All modules</Link></div>
      <PageHead eyebrow={`Week ${m.week}${m.published ? '' : ' · Draft'}`} title={m.title}>
        {data.status && <StatusPill completed={data.status.completed} drill={data.status.drill_status} />}
      </PageHead>

      <div className="grid">
        <div className="c8 stack" style={{ gap: 16 }}>
          {m.objective && (
            <div className="next">
              <span className="eyebrow" style={{ color: 'var(--warn)' }}>By the end you can</span>
              <b style={{ fontSize: 15 }}>{m.objective}</b>
            </div>
          )}

          {(m.body || embed || m.video_url || m.resource_url) && (
            <Panel title="Workshop">
              {embed && <div className="video"><iframe src={embed} title={m.title} allow="encrypted-media; picture-in-picture" allowFullScreen /></div>}
              {m.body && <p className="reading">{m.body}</p>}
              <div className="row">
                {m.video_url && !embed && <a className="btn ghost" href={m.video_url} target="_blank" rel="noreferrer">Watch the session ↗</a>}
                {m.resource_url && <a className="btn ghost" href={m.resource_url} target="_blank" rel="noreferrer">Open slides / reading ↗</a>}
              </div>
            </Panel>
          )}

          {data.questions.length > 0 && data.status && (
            <Quiz moduleId={m.id} questions={data.questions} status={data.status} settings={data.settings} onDone={mod.reload} />
          )}

          {m.drill_prompt && <Drill moduleId={m.id} prompt={m.drill_prompt} existing={data.drill} onDone={mod.reload} />}
        </div>

        <div className="c4 stack">
          <Panel title="To complete this module">
            <ul className="checks">
              {data.questions.length > 0 && (
                <li>
                  <span className={`chk ${(data.status?.quiz_best ?? 0) >= data.settings.quiz_pass_mark ? 'ok' : 'no'}`}>{(data.status?.quiz_best ?? 0) >= data.settings.quiz_pass_mark ? '✓' : ''}</span>
                  <span>Score {data.settings.quiz_pass_mark}%+ on the quiz</span>
                  <span className="mono muted">{data.status?.quiz_best != null ? `${Math.round(data.status.quiz_best)}%` : '—'}</span>
                </li>
              )}
              {m.drill_prompt && (
                <li>
                  <span className={`chk ${data.drill ? 'ok' : 'no'}`}>{data.drill ? '✓' : ''}</span>
                  <span>Submit the drill</span>
                  <span className="mono muted">{data.drill ? (data.drill.status === 'reviewed' ? `${data.drill.score}/100` : 'In review') : '—'}</span>
                </li>
              )}
            </ul>
            <p className="note">Your best quiz score counts. Drills are scored by a mentor out of 100.</p>
          </Panel>
        </div>
      </div>
    </>
  );
}

function Quiz({ moduleId, questions, status, settings, onDone }: {
  moduleId: string; questions: Question[]; status: ModuleStatus; settings: Settings; onDone: () => void;
}) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retaking, setRetaking] = useState(false);
  const passed = (status.quiz_best ?? 0) >= settings.quiz_pass_mark;
  const outOfTries = status.attempts_left <= 0;
  const unanswered = answers.filter(a => a === null).length;

  async function submit() {
    setBusy(true); setError('');
    try {
      const r = await rpc<QuizResult>('submit_quiz', { p_module: moduleId, p_answers: answers });
      setResult(r);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }

  function retry() { setResult(null); setAnswers(questions.map(() => null)); onDone(); }

  const meta = result
    ? `${result.attempts_left} attempt${result.attempts_left === 1 ? '' : 's'} left`
    : `Pass mark ${settings.quiz_pass_mark}% · ${status.attempts_left} of ${settings.quiz_max_attempts} attempts left`;

  if (!result && !retaking && (passed || outOfTries)) {
    return (
      <Panel title="Quiz" meta={`Best score ${Math.round(status.quiz_best ?? 0)}%`}>
        <div className={`alert ${passed ? 'ok' : 'err'}`}>
          {passed ? `Passed with ${Math.round(status.quiz_best ?? 0)}%.` : `No attempts left. Your best was ${Math.round(status.quiz_best ?? 0)}%. Talk to your mentor about next steps.`}
          {passed && status.attempts_left > 0 && ' You can retake it to improve your best score.'}
        </div>
        {passed && status.attempts_left > 0 && <div><button className="btn ghost" onClick={() => setRetaking(true)}>Retake quiz</button></div>}
      </Panel>
    );
  }

  return (
    <Panel title="Quiz" meta={meta}>
      {result && (
        <div className={`alert ${result.passed ? 'ok' : 'err'}`} role="status">
          <b>{result.correct} of {result.total} correct · {Math.round(result.score)}%.</b>{' '}
          {result.passed ? 'Passed.' : result.attempts_left > 0 ? `You need ${result.pass_mark}%. Review the workshop and try again.` : 'That was your last attempt.'}
        </div>
      )}
      {questions.map((q, qi) => {
        const r = result?.results[qi];
        return (
          <fieldset key={q.id} className="q" style={{ border: 0, margin: 0, padding: undefined }}>
            <legend style={{ fontWeight: 600, padding: 0, marginBottom: 6 }}>{qi + 1}. {q.prompt}</legend>
            <div className="stack" style={{ gap: 6 }}>
              {q.options.map((o, oi) => (
                <label key={oi} className={`opt ${answers[qi] === oi ? 'sel' : ''}`}>
                  <input type="radio" id={`q${qi}-o${oi}`} name={`q${qi}`} disabled={!!result} checked={answers[qi] === oi}
                    onChange={() => setAnswers(a => a.map((x, i) => (i === qi ? oi : x)))} />
                  <span>{o}</span>
                </label>
              ))}
            </div>
            {r && <div className={`result ${r.correct ? 'ok' : 'no'}`}>{r.correct ? 'Correct.' : 'Not quite.'}{r.explanation ? ` ${r.explanation}` : ''}</div>}
          </fieldset>
        );
      })}
      {error && <div className="alert err">{error}</div>}
      {!result
        ? <div className="row"><button className="btn" disabled={busy || unanswered > 0} onClick={submit}>{busy ? 'Scoring…' : 'Submit answers'}</button>{unanswered > 0 && <span className="note">{unanswered} unanswered</span>}</div>
        : <div className="row">
            {!result.passed && result.attempts_left > 0 && <button className="btn" onClick={retry}>Try again</button>}
            {(result.passed || result.attempts_left === 0) && <button className="btn ghost" onClick={onDone}>Done</button>}
          </div>}
    </Panel>
  );
}

function Drill({ moduleId, prompt, existing, onDone }: {
  moduleId: string; prompt: string;
  existing: { answer: string; status: string; score: number | null; feedback: string; updated_at: string } | null;
  onDone: () => void;
}) {
  const [text, setText] = useState(existing?.answer ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const reviewed = existing?.status === 'reviewed';

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      await rpc('submit_drill', { p_module: moduleId, p_answer: text });
      setMsg({ ok: true, text: existing ? 'Answer updated. Your mentor will see the new version.' : 'Submitted. A mentor will review it.' });
      onDone();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? friendlyError(e.message) : String(e) }); }
    setBusy(false);
  }

  return (
    <Panel title="Drill" meta={existing ? (reviewed ? 'Reviewed' : `Submitted ${fmtDate(existing.updated_at)} · editable until reviewed`) : 'Scored by a mentor'}>
      <p className="reading" style={{ fontSize: 14 }}>{prompt}</p>
      {reviewed ? (
        <>
          <pre className="answer">{existing!.answer}</pre>
          <div className="sub-card" style={{ background: 'var(--soft)' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}><b>Mentor feedback</b><span className="pill n">{existing!.score} / 100</span></div>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{existing!.feedback || 'No written feedback.'}</p>
          </div>
        </>
      ) : (
        <>
          <label className="field">Your answer
            <textarea id={`drill-${moduleId}`} rows={8} value={text} onChange={e => setText(e.target.value)} placeholder="Show your working. Mentors score the reasoning, not just the final number." />
          </label>
          {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.text}</div>}
          <div className="row">
            <button className="btn" disabled={busy || text.trim().length < 20 || text === existing?.answer} onClick={submit}>
              {busy ? 'Saving…' : existing ? 'Update answer' : 'Submit drill'}
            </button>
            <span className="note">{text.trim().length < 20 ? 'Write at least a couple of sentences.' : `${text.trim().split(/\s+/).length} words`}</span>
          </div>
        </>
      )}
    </Panel>
  );
}
