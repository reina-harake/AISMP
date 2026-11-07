import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { api } from '../api';
import { Brand, Icon, LangSwitch } from './ui';

const NAV = {
  citizen: [
    ['/home', 'home', 'nav.home'],
    ['/report', 'plus', 'nav.newComplaint'],
    ['/complaints', 'list', 'nav.myComplaints'],
    ['/requests', 'doc', 'nav.requests'],
    ['/notifications', 'bell', 'nav.notifications'],
    ['/profile', 'user', 'nav.profile'],
  ],
  employee: [
    ['/queue', 'inbox', 'nav.queue'],
    ['/requests', 'doc', 'nav.requests'],
    ['/stats', 'chart', 'nav.dashboard'],
    ['/notifications', 'bell', 'nav.notifications'],
    ['/profile', 'user', 'nav.profile'],
  ],
  admin: [
    ['/admin', 'chart', 'nav.dashboard'],
    ['/queue', 'inbox', 'nav.complaints'],
    ['/requests', 'doc', 'nav.requests'],
    ['/users', 'users', 'nav.users'],
    ['/notifications', 'bell', 'nav.notifications'],
    ['/profile', 'user', 'nav.profile'],
  ],
};

/** Signed-in area: sidebar navigation + page content. */
export default function Layout() {
  const { user, logout, updateProfile } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  // keep the unread counter fresh while navigating (and every 30s)
  useEffect(() => {
    let alive = true;
    const load = () => api.get('/notifications', { unread: 'true' })
      .then((r) => alive && setUnread(r.unread)).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [loc.pathname]);

  useEffect(() => setOpen(false), [loc.pathname]);

  const items = NAV[user.role] || NAV.citizen;

  const sidebar = (
    <aside className={`side${open ? ' open' : ''}`} aria-label={t('nav.menu')}>
      <Brand to={items[0][0]} />
      <nav>
        {items.map(([to, icon, key]) => (
          <NavLink key={to} to={to} end={to === '/admin'}>
            <Icon name={icon} />
            {t(key)}
            {to === '/notifications' && unread > 0 && <span className="badge">{unread}</span>}
          </NavLink>
        ))}
        <NavLink to="/transparency"><Icon name="globe" />{t('nav.publicStats')}</NavLink>
      </nav>
      <div className="side-user">
        <div>
          <strong>{user.name}</strong>
          <span className="faint">{t(`role.${user.role}`)}</span>
        </div>
        {/* changing language here also saves it to the profile, so notifications follow */}
        <LangSwitch onChange={(l) => updateProfile({ language: l }).catch(() => {})} />
        <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}
          onClick={() => { logout(); nav('/'); }}>
          <Icon name="logout" /> {t('nav.logout')}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="shell">
      {sidebar}
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <div>
        <div className="mobile-top">
          <button className="btn btn-ghost" onClick={() => setOpen(true)} aria-label={t('nav.menu')}>
            <Icon name="menu" />
          </button>
          <Brand to={items[0][0]} />
          <span className="spacer" />
          <Link to="/notifications" className="btn btn-ghost" aria-label={t('nav.notifications')}>
            <Icon name="bell" />{unread > 0 && <span className="badge">{unread}</span>}
          </Link>
        </div>
        <main className="main" id="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
