import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { homeFor, useAuth } from './auth';
import { useI18n } from './i18n';
import Layout from './components/Layout';
import ChatWidget from './components/ChatWidget';
import { Loading } from './components/ui';
import { ForgotPassword, Landing, Login, PublicLayout, Register, ResetPassword, Transparency } from './pages/Public';
import { CitizenHome, Notifications, Profile, Report } from './pages/Citizen';
import { ComplaintDetail, ComplaintList } from './pages/Complaints';
import Requests from './pages/Requests';
import { Dashboard, Users } from './pages/Admin';

/** Only lets signed-in users with one of `roles` through. */
function Guard({ roles, children }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  return children;
}

function NotFound() {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <div className="empty" style={{ minHeight: '50vh', alignContent: 'center' }}>
      <p>{t('common.notFound')}</p>
      <Link className="btn btn-secondary" to={homeFor(user)}>{t('common.goHome')}</Link>
    </div>
  );
}

const ALL = ['citizen', 'employee', 'admin'];
const STAFF = ['employee', 'admin'];

export default function App() {
  const { loading } = useAuth();
  if (loading) return <Loading />;
  return (
    <>
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
      </Route>

      <Route element={<Guard roles={ALL}><Layout /></Guard>}>
        <Route path="home" element={<Guard roles={['citizen']}><CitizenHome /></Guard>} />
        <Route path="report" element={<Guard roles={['citizen']}><Report /></Guard>} />
        <Route path="complaints" element={<ComplaintList />} />
        <Route path="complaints/:id" element={<ComplaintDetail />} />
        <Route path="queue" element={<Guard roles={STAFF}><ComplaintList /></Guard>} />
        <Route path="requests" element={<Requests />} />
        <Route path="requests/:id" element={<Requests />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<Profile />} />
        <Route path="stats" element={<Guard roles={STAFF}><Dashboard /></Guard>} />
        <Route path="admin" element={<Guard roles={['admin']}><Dashboard /></Guard>} />
        <Route path="users" element={<Guard roles={['admin']}><Users /></Guard>} />
        <Route path="transparency" element={<Transparency />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
    <ChatWidget />
    </>
  );
}
