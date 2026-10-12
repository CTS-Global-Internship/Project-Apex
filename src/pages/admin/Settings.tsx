import { useEffect, useState } from 'react';
import { supabase, friendlyError } from '../../lib/supabase';
import type { Level, Settings } from '../../lib/types';
import { Loading, PageHead, Panel } from '../../components/ui';

export default function ScoringSettings() {
  const [s, setS] = useState<Settings | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [lvlMsg, setLvlMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const [a, b] = await Promise.all([
      supabase.from('app_settings').select('*').single(),
      supabase.from('levels').select('*').order('rank'),
    ]);
    setS(a.data as Settings);
    setLevels((b.data ?? []) as Level[]);
  }
  useEffect(() => { load(); }, []);

  if (!s) return <Loading />;
  const total = s.weight_quiz + s.weight_drill + s.weight_completion;
  const share = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  async function saveSettings() {
    if (total === 0) return setMsg({ ok: false, text: 'At least one weight must be above zero.' });
    const { weight_quiz, weight_drill, weight_completion, quiz_pass_mark, drill_pass_mark, quiz_max_attempts } = s!;
    const { error } = await supabase.from('app_settings')
      .update({ weight_quiz, weight_drill, weight_completion, quiz_pass_mark, drill_pass_mark, quiz_max_attempts, updated_at: new Date().toISOString() })
      .eq('id', 1);
    setMsg(error ? { ok: false, text: friendlyError(error.message) } : { ok: true, text: 'Saved. Every score and rank updates right away.' });
  }

  async function saveLevels() {
    setLvlMsg(null);
    for (const l of levels) {
      const row = { rank: l.rank, name: l.name.trim(), description: l.description, min_score: l.min_score, min_modules: l.min_modules, min_drills_passed: l.min_drills_passed };
      const { error } = l.id > 0
        ? await supabase.from('levels').update(row).eq('id', l.id)
        : await supabase.from('levels').insert(row);
      if (error) return setLvlMsg({ ok: false, text: `${l.name}: ${friendlyError(error.message)}` });
    }
    setLvlMsg({ ok: true, text: 'Ladder saved.' });
    load();
  }

  async function removeLevel(l: Level) {
    if (l.id < 0) return setLevels(levels.filter(x => x !== l));
    const { error } = await supabase.from('levels').delete().eq('id', l.id);
    if (error) setLvlMsg({ ok: false, text: 'Can’t delete a level while people are on it. Move them first.' });
    else load();
  }

  const num = (k: keyof Settings) => (
    <input id={`set-${k}`} type="number" min={0} max={k.startsWith('weight') ? 100 : k === 'quiz_max_attempts' ? 20 : 100}
      value={s[k]} onChange={e => setS({ ...s, [k]: Math.max(0, Number(e.target.value) || 0) })} />
  );
  const setL = (i: number, patch: Partial<Level>) => setLevels(levels.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <>
      <PageHead eyebrow="Admin" title="Scoring & levels" />
      <div className="grid">
        <Panel className="c5" title="Apex Score" meta="0–1000, recalculated live">
          <p className="note">Each part is scored 0–100 across all published modules (anything not done counts as 0), then blended by these weights.</p>
          <div className="form-grid">
            <label className="field">Quiz weight {num('weight_quiz')}<span className="hint">{share(s.weight_quiz)}% of score</span></label>
            <label className="field">Drill weight {num('weight_drill')}<span className="hint">{share(s.weight_drill)}% of score</span></label>
            <label className="field">Completion weight {num('weight_completion')}<span className="hint">{share(s.weight_completion)}% of score</span></label>
            <span />
            <label className="field">Quiz pass mark (%) {num('quiz_pass_mark')}</label>
            <label className="field">Drill pass mark (/100) {num('drill_pass_mark')}</label>
            <label className="field">Quiz attempts allowed {num('quiz_max_attempts')}</label>
          </div>
          {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
          <div><button className="btn" onClick={saveSettings}>Save scoring</button></div>
        </Panel>

        <Panel className="c7" title="Promotion ladder" meta="Interns start on the first level">
          <p className="note">An intern is flagged “ready” when they meet all three numbers for the next level. A mentor then confirms the promotion.</p>
          <div className="tbl">
            <table>
              <thead><tr><th>#</th><th>Level</th><th className="r">Min score</th><th className="r">Modules</th><th className="r">Drills passed</th><th /></tr></thead>
              <tbody>
                {levels.map((l, i) => (
                  <tr key={l.id}>
                    <td className="num">{l.rank}</td>
                    <td><input id={`lv-name-${l.id}`} value={l.name} onChange={e => setL(i, { name: e.target.value })} aria-label="Level name" />
                      <input id={`lv-desc-${l.id}`} value={l.description} onChange={e => setL(i, { description: e.target.value })} placeholder="Short description" aria-label="Description" style={{ marginTop: 4, fontSize: 12 }} /></td>
                    {(['min_score', 'min_modules', 'min_drills_passed'] as const).map(k => (
                      <td key={k}><input id={`lv-${k}-${l.id}`} type="number" min={0} value={l[k]} disabled={i === 0} onChange={e => setL(i, { [k]: Number(e.target.value) || 0 })} style={{ width: 80, textAlign: 'right' }} aria-label={k} /></td>
                    ))}
                    <td>{i > 0 && <button className="btn sm danger" onClick={() => removeLevel(l)} aria-label={`Remove ${l.name}`}>×</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lvlMsg && <div className={`alert ${lvlMsg.ok ? 'ok' : 'err'}`}>{lvlMsg.text}</div>}
          <div className="row">
            <button className="btn ghost" onClick={() => setLevels([...levels, { id: -Date.now(), rank: (levels.at(-1)?.rank ?? 0) + 1, name: 'New level', description: '', min_score: 0, min_modules: 0, min_drills_passed: 0 }])}>+ Add level</button>
            <button className="btn" onClick={saveLevels}>Save ladder</button>
          </div>
        </Panel>
      </div>
    </>
  );
}
