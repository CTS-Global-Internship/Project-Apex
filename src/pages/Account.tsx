import { useState, type FormEvent } from 'react';
import { supabase, friendlyError } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHead, Panel } from '../components/ui';

export default function Account() {
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [school, setSchool] = useState(profile?.school ?? '');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('profiles').update({ full_name: name.trim(), school: school.trim() }).eq('id', profile!.id);
    if (error) setMsg({ ok: false, text: friendlyError(error.message) });
    else { setMsg({ ok: true, text: 'Saved.' }); refreshProfile(); }
  }

  async function changePw(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setPwMsg({ ok: false, text: 'Use at least 8 characters.' });
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwMsg(error ? { ok: false, text: friendlyError(error.message) } : { ok: true, text: 'Password changed.' });
    if (!error) setPw('');
  }

  return (
    <>
      <PageHead eyebrow={profile?.email} title="Your account" />
      <div className="grid">
        <Panel className="c6" title="Profile">
          <form className="stack" onSubmit={save}>
            <label className="field">Full name<input id="acc-name" value={name} onChange={e => setName(e.target.value)} required /></label>
            <label className="field">School<input id="acc-school" value={school} onChange={e => setSchool(e.target.value)} /></label>
            {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
            <div><button className="btn">Save</button></div>
          </form>
        </Panel>
        <Panel className="c6" title="Password">
          <form className="stack" onSubmit={changePw}>
            <label className="field">New password<input id="acc-pw" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></label>
            {pwMsg && <div className={`alert ${pwMsg.ok ? 'ok' : 'err'}`}>{pwMsg.text}</div>}
            <div><button className="btn">Change password</button></div>
          </form>
        </Panel>
      </div>
    </>
  );
}
