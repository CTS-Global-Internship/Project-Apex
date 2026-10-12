import { useState, type FormEvent } from 'react';
import { supabase, friendlyError } from '../../lib/supabase';
import { useLoad, fmtDate } from '../../lib/hooks';
import { Loading, ErrorNote, PageHead, Panel, Empty } from '../../components/ui';

interface Invite { code: string; role: string; cohort: string; max_uses: number; uses: number; expires_at: string | null; active: boolean; note: string; created_at: string }

function randomCode(prefix: string) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const tail = Array.from(crypto.getRandomValues(new Uint32Array(6)), n => chars[n % chars.length]).join('');
  return `${prefix.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 10) || 'APEX'}-${tail}`;
}

export default function Invites() {
  const { data, error, loading, reload } = useLoad(async () => {
    const { data, error } = await supabase.from('invite_codes').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data as Invite[];
  });
  const [form, setForm] = useState({ role: 'intern', cohort: '', max_uses: 30, expires: '', note: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState('');

  async function create(e: FormEvent) {
    e.preventDefault();
    const code = randomCode(form.role === 'intern' ? (form.cohort || 'BATCH') : form.role);
    const { error } = await supabase.from('invite_codes').insert({
      code, role: form.role, cohort: form.role === 'intern' ? form.cohort.trim() : '',
      max_uses: form.max_uses, note: form.note.trim(),
      expires_at: form.expires ? new Date(form.expires + 'T23:59:59').toISOString() : null,
    });
    if (error) return setMsg({ ok: false, text: friendlyError(error.message) });
    setMsg({ ok: true, text: `Created ${code}. Share it with the people who should join.` });
    reload();
  }

  async function toggle(i: Invite) {
    await supabase.from('invite_codes').update({ active: !i.active }).eq('code', i.code);
    reload();
  }

  async function copy(code: string) {
    try { await navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(''), 1500); } catch { /* clipboard blocked; code is selectable */ }
  }

  const usable = (i: Invite) => i.active && i.uses < i.max_uses && (!i.expires_at || new Date(i.expires_at) > new Date());

  return (
    <>
      <PageHead eyebrow="Admin" title="Invite codes" />
      <p className="note">Nobody can sign up without a code. Make one per batch for interns, and a separate one for mentors. The code decides their role and batch.</p>
      <div className="grid">
        <Panel className="c4" title="New code">
          <form className="stack" onSubmit={create}>
            <label className="field">Role
              <select id="inv-role" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="intern">Intern</option><option value="mentor">Mentor</option><option value="admin">Admin</option>
              </select>
            </label>
            {form.role === 'intern' && <label className="field">Batch<input id="inv-cohort" value={form.cohort} onChange={e => setForm({ ...form, cohort: e.target.value })} placeholder="e.g. 2026-B" required /></label>}
            <label className="field">How many people can use it<input id="inv-max" type="number" min={1} max={500} value={form.max_uses} onChange={e => setForm({ ...form, max_uses: Number(e.target.value) || 1 })} /></label>
            <label className="field"><span>Expires <span className="hint">(optional)</span></span><input id="inv-exp" type="date" value={form.expires} onChange={e => setForm({ ...form, expires: e.target.value })} /></label>
            <label className="field"><span>Note <span className="hint">(optional)</span></span><input id="inv-note" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="e.g. UP & Ateneo interns" /></label>
            {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
            <button className="btn amber">Create code</button>
          </form>
        </Panel>
        <Panel className="c8" title="Codes">
          {loading ? <Loading /> : error ? <ErrorNote message={error} onRetry={reload} /> : !data?.length ? <Empty title="No codes yet" /> : (
            <div className="tbl">
              <table>
                <thead><tr><th>Code</th><th>For</th><th className="r">Used</th><th>Expires</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {data.map(i => (
                    <tr key={i.code}>
                      <td><span className="mono" style={{ userSelect: 'all' }}>{i.code}</span> <button className="btn sm ghost" onClick={() => copy(i.code)}>{copied === i.code ? 'Copied' : 'Copy'}</button>{i.note && <div className="note">{i.note}</div>}</td>
                      <td style={{ textTransform: 'capitalize' }}>{i.role}{i.cohort && ` · ${i.cohort}`}</td>
                      <td className="r num">{i.uses} / {i.max_uses}</td>
                      <td>{i.expires_at ? fmtDate(i.expires_at) : '—'}</td>
                      <td>{usable(i) ? <span className="pill g">Open</span> : <span className="pill">{i.active ? 'Used up / expired' : 'Turned off'}</span>}</td>
                      <td><button className="btn sm ghost" onClick={() => toggle(i)}>{i.active ? 'Turn off' : 'Turn on'}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
