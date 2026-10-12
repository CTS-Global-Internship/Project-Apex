import { NavLink, Outlet, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth, isStaff, isAdmin } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Mark } from './ui';

export default function Layout() {
  const { profile, signOut } = useAuth();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!isStaff(profile)) return;
    supabase.from('drill_submissions').select('id', { count: 'exact', head: true }).eq('status', 'submitted')
      .then(({ count }) => setPending(count ?? 0));
  }, [profile]);

  const roleLabel = { intern: 'Intern', mentor: 'Mentor', admin: 'Admin' }[profile?.role ?? 'intern'];

  return (
    <div className="app">
      <aside className="rail">
        <Link to="/" className="brand"><Mark /><div><b>APEX</b><small>CTS Trader’s Apprenticeship</small></div></Link>
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/learn">Learn</NavLink>
          <NavLink to="/leaderboard">Leaderboard</NavLink>
          {isStaff(profile) && <>
            <div className="nav-label">Mentors</div>
            <NavLink to="/mentor/review">Review drills {pending > 0 && <span className="count">{pending}</span>}</NavLink>
            <NavLink to="/mentor/interns">Interns</NavLink>
          </>}
          {isAdmin(profile) && <>
            <div className="nav-label">Admin</div>
            <NavLink to="/admin/modules">Modules</NavLink>
            <NavLink to="/admin/invites">Invite codes</NavLink>
            <NavLink to="/admin/people">People</NavLink>
            <NavLink to="/admin/settings">Scoring &amp; levels</NavLink>
          </>}
        </nav>
        <div className="rail-foot">
          <span><b>{profile?.full_name || profile?.email}</b><br />{roleLabel}{profile?.cohort ? ` · ${profile.cohort}` : ''}</span>
          <span className="row" style={{ gap: 12 }}>
            <Link to="/account" className="linkish">Account</Link>
            <button className="linkish" onClick={signOut}>Sign out</button>
          </span>
        </div>
      </aside>
      <main><Outlet /></main>
    </div>
  );
}
