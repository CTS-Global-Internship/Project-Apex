import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth, isStaff, isAdmin } from './lib/auth';
import { Loading } from './components/ui';
import Layout from './components/Layout';
import { SignIn, SignUp, ForgotPassword, SetNewPassword } from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Learn from './pages/Learn';
import ModulePage from './pages/ModulePage';
import Leaderboard from './pages/Leaderboard';
import Account from './pages/Account';
import Review from './pages/mentor/Review';
import Interns from './pages/mentor/Interns';
import AdminModules from './pages/admin/Modules';
import ModuleEditor from './pages/admin/ModuleEditor';
import Invites from './pages/admin/Invites';
import People from './pages/admin/People';
import ScoringSettings from './pages/admin/Settings';

function Gate({ allow, children }: { allow: boolean; children: ReactNode }) {
  return allow ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  const { session, profile, loading, profileLoading, recovering, signOut } = useAuth();

  if (loading) return <Loading />;
  if (recovering) return <SetNewPassword />;

  if (!session) {
    return (
      <Routes>
        <Route path="/signup" element={<SignUp />} />
        <Route path="/forgot" element={<ForgotPassword />} />
        <Route path="*" element={<SignIn />} />
      </Routes>
    );
  }

  if (!profile) {
    if (profileLoading) return <Loading />;
    return (
      <div className="auth-main" style={{ minHeight: '100vh' }}>
        <div className="auth-card">
          <h2>We couldn’t load your account</h2>
          <p className="note">Your sign-in worked, but there’s no Apex profile attached to it. Ask your program lead to check your invite.</p>
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="learn" element={<Learn />} />
        <Route path="learn/:id" element={<ModulePage />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="account" element={<Account />} />
        <Route path="mentor/review" element={<Gate allow={isStaff(profile)}><Review /></Gate>} />
        <Route path="mentor/interns" element={<Gate allow={isStaff(profile)}><Interns /></Gate>} />
        <Route path="admin/modules" element={<Gate allow={isAdmin(profile)}><AdminModules /></Gate>} />
        <Route path="admin/modules/:id" element={<Gate allow={isAdmin(profile)}><ModuleEditor /></Gate>} />
        <Route path="admin/invites" element={<Gate allow={isAdmin(profile)}><Invites /></Gate>} />
        <Route path="admin/people" element={<Gate allow={isAdmin(profile)}><People /></Gate>} />
        <Route path="admin/settings" element={<Gate allow={isAdmin(profile)}><ScoringSettings /></Gate>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
