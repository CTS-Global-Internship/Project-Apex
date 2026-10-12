import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { supabase, friendlyError } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Mark } from '../components/ui';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-side">
        <div className="brand" style={{ color: 'var(--paper)' }}><Mark /><div><b>APEX</b><small style={{ color: 'inherit', opacity: .7 }}>CTS Global Equity Group</small></div></div>
        <div className="stack">
          <span className="eyebrow" style={{ color: 'var(--amber)' }}>Trader’s Apprenticeship</span>
          <h1>Learn the desk. Prove it on the book.</h1>
          <p>Workshops, drills and mentor reviews in one place. Every module you finish moves your Apex Score and your path to the next level.</p>
        </div>
        <div className="tape"><span>LEARN</span><span>→ DRILL</span><span>→ REVIEW</span><span>→ RANK UP</span></div>
      </aside>
      <div className="auth-main"><div className="auth-card">{children}</div></div>
    </div>
  );
}

export function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(friendlyError(error.message));
    setBusy(false);
  }

  return (
    <Shell>
      <div><div className="eyebrow">Welcome back</div><h2 style={{ fontSize: 28 }}>Sign in</h2></div>
      <form className="stack" onSubmit={submit}>
        <label className="field">Email<input id="si-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="field">Password<input id="si-pass" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        {error && <div className="alert err" role="alert">{error}</div>}
        <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Link to="/forgot" className="note">Forgot password?</Link>
        <Link to="/signup" className="note">I have an invite code</Link>
      </div>
    </Shell>
  );
}

export function SignUp() {
  const [form, setForm] = useState({ full_name: '', school: '', email: '', password: '', confirm: '', code: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) return setError('Use at least 8 characters for your password.');
    if (form.password !== form.confirm) return setError('The two passwords don’t match.');
    setBusy(true);
    const { data: ok } = await supabase.rpc('check_invite_code', { p_code: form.code });
    if (!ok) { setBusy(false); return setError(friendlyError('INVALID_INVITE_CODE')); }
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: form.full_name.trim(), school: form.school.trim(), invite_code: form.code.trim() },
      },
    });
    setBusy(false);
    if (error) return setError(friendlyError(error.message));
    if (!data.session) setDone(true); // email confirmation is on
  }

  if (done) return (
    <Shell>
      <h2 style={{ fontSize: 28 }}>Check your email</h2>
      <p>We sent a confirmation link to <b>{form.email}</b>. Open it to finish setting up your account, then sign in.</p>
      <Link to="/" className="btn ghost">Back to sign in</Link>
    </Shell>
  );

  return (
    <Shell>
      <div><div className="eyebrow">New account</div><h2 style={{ fontSize: 28 }}>Join with your invite code</h2></div>
      <form className="stack" onSubmit={submit}>
        <label className="field">Invite code<input id="su-code" required autoCapitalize="characters" value={form.code} onChange={set('code')} placeholder="e.g. BATCH-2026B" /></label>
        <label className="field">Full name<input id="su-name" required autoComplete="name" value={form.full_name} onChange={set('full_name')} /></label>
        <label className="field"><span>School <span className="hint">(optional)</span></span><input id="su-school" value={form.school} onChange={set('school')} /></label>
        <label className="field">Email<input id="su-email" type="email" required autoComplete="email" value={form.email} onChange={set('email')} /></label>
        <label className="field">Password<input id="su-pass" type="password" required autoComplete="new-password" value={form.password} onChange={set('password')} /></label>
        <label className="field">Confirm password<input id="su-confirm" type="password" required autoComplete="new-password" value={form.confirm} onChange={set('confirm')} /></label>
        {error && <div className="alert err" role="alert">{error}</div>}
        <button className="btn" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
      <Link to="/" className="note">Already have an account? Sign in</Link>
    </Shell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    if (error) setError(friendlyError(error.message)); else setSent(true);
  }

  return (
    <Shell>
      <h2 style={{ fontSize: 28 }}>Reset your password</h2>
      {sent ? <p>If <b>{email}</b> has an account, a reset link is on its way. Open it on this device.</p> : (
        <form className="stack" onSubmit={submit}>
          <label className="field">Email<input id="fp-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
          {error && <div className="alert err" role="alert">{error}</div>}
          <button className="btn">Send reset link</button>
        </form>
      )}
      <Link to="/" className="note">Back to sign in</Link>
    </Shell>
  );
}

export function SetNewPassword() {
  const { signOut } = useAuth();
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setMsg({ ok: false, text: 'Use at least 8 characters.' });
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return setMsg({ ok: false, text: friendlyError(error.message) });
    setMsg({ ok: true, text: 'Password updated. Sign in with your new password.' });
    setTimeout(signOut, 1500);
  }

  return (
    <Shell>
      <h2 style={{ fontSize: 28 }}>Choose a new password</h2>
      <form className="stack" onSubmit={submit}>
        <label className="field">New password<input id="np-pass" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></label>
        {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.text}</div>}
        <button className="btn">Save password</button>
      </form>
    </Shell>
  );
}
