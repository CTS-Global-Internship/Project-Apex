import { useState } from 'react';
import { rpc, supabase } from '../../lib/supabase';
import { useLoad, fmtDate } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import type { Profile } from '../../lib/types';
import { Loading, ErrorNote, PageHead, Panel } from '../../components/ui';

export default function People() {
  const { profile: me } = useAuth();
  const { data, error, loading, reload } = useLoad(async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('role').order('full_name');
    if (error) throw new Error(error.message);
    return data as (Profile & { created_at: string })[];
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState('');

  async function act(fn: string, args: Record<string, unknown>, ok: string) {
    setMsg(null);
    try { await rpc(fn, args); setMsg({ ok: true, text: ok }); reload(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
  }

  const rows = (data ?? []).filter(p => !filter || `${p.full_name} ${p.email} ${p.cohort} ${p.role}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <PageHead eyebrow="Admin" title="People">
        <input id="ppl-search" placeholder="Search name, email, batch" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 240 }} />
      </PageHead>
      {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      <Panel meta={`${data?.length ?? 0} accounts`} title="Everyone">
        {loading ? <Loading /> : error ? <ErrorNote message={error} onRetry={reload} /> : (
          <div className="tbl">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Batch</th><th>Joined</th></tr></thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.id}>
                    <td><b>{p.full_name || '—'}</b>{p.id === me?.id && <span className="muted"> (you)</span>}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{p.email}</td>
                    <td>
                      <select id={`role-${p.id}`} value={p.role} style={{ width: 'auto' }} aria-label={`Role for ${p.full_name}`}
                        onChange={e => act('admin_set_role', { p_user: p.id, p_role: e.target.value }, `${p.full_name || p.email} is now ${e.target.value}.`)}>
                        <option value="intern">Intern</option><option value="mentor">Mentor</option><option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>
                      <input id={`cohort-${p.id}`} defaultValue={p.cohort} style={{ width: 110 }} aria-label={`Batch for ${p.full_name}`}
                        onBlur={e => e.target.value !== p.cohort && act('admin_set_cohort', { p_user: p.id, p_cohort: e.target.value }, `Batch updated for ${p.full_name || p.email}.`)} />
                    </td>
                    <td>{fmtDate(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="note">To remove someone completely, delete their user in Supabase → Authentication → Users. Their profile and work are removed with it.</p>
      </Panel>
    </>
  );
}
