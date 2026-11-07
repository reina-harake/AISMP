import { useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { homeFor, useAuth } from '../auth';
import { useI18n } from '../i18n';
import { Brand, ErrorBox, LangSwitch, Loading, PasswordInput, Prio, useLoad } from '../components/ui';
import { CategoryBars } from './charts';
import { MUNICIPALITY } from '../municipality';

export function PublicLayout() {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <>
      <div className="public-head"><header className="public-top">
        <Brand />
        <span className="spacer" />
        <LangSwitch />
        {user ? (
          <Link className="btn btn-primary" to={homeFor(user)}>{t('nav.home')}</Link>
        ) : (
          <Link className="btn btn-secondary" to="/login">{t('nav.login')}</Link>
        )}
      </header></div>
      <Outlet />
    </>
  );
}

// Real complaints in the four languages the model understands; the hero shows them as they would be read.
const VOICES = [
  { text: 'el kahraba ma2tou3a men 3 iyem bel 7ay', lang: 'arabizi', cat: 'electricity', prio: 'high', dir: 'ltr' },
  { text: 'في قسطل مكسور بالشارع والمي عم تطوف من مبارح', lang: 'ar', cat: 'water', prio: 'high', dir: 'rtl' },
  { text: 'Les poubelles débordent devant l’école depuis une semaine.', lang: 'fr', cat: 'waste', prio: 'medium', dir: 'ltr' },
  { text: 'Deep pothole near the roundabout, two cars hit it today.', lang: 'en', cat: 'road_damage', prio: 'medium', dir: 'ltr' },
];

export function Landing() {
  const { t } = useI18n();
  const { user } = useAuth();
  const stats = useLoad(() => api.get('/dashboard/public', { days: 30 }), []);

  return (
    <main className="public-main">
      <section className="hero">
        <div>
          <h1>{t('landing.title')}</h1>
          <p className="lead">{t('landing.lead')}</p>
          <div className="row">
            <Link className="btn btn-primary btn-lg" to={user ? '/report' : '/register'}>{t('landing.ctaReport')}</Link>
            {!user && <Link className="btn btn-secondary btn-lg" to="/login">{t('landing.ctaLogin')}</Link>}
          </div>
        </div>
        <div className="voices" aria-label={t('landing.howTitle')}>
          {VOICES.map((v) => (
            <figure className="voice" key={v.lang}>
              <blockquote className="voice-text" dir={v.dir} lang={v.lang === 'arabizi' ? 'ar-Latn' : v.lang} style={{ margin: 0 }}>
                {v.text}
              </blockquote>
              <figcaption className="voice-meta">
                <span className="chip">{t(`textLang.${v.lang}`)}</span>
                <span className="chip">{t(`category.${v.cat}`)}</span>
                <Prio value={v.prio} />
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="how">
        <h2>{t('landing.howTitle')}</h2>
        {['step1', 'step2', 'step3'].map((s, i) => (
          <div className="how-step" key={s}>
            <span className="how-num">{i + 1}</span>
            <p>{t(`landing.${s}`)}</p>
          </div>
        ))}
      </section>

      <PublicStatsSection stats={stats} />

      <ContactSection />

      <footer className="public-foot">{t('landing.footer')}</footer>
    </main>
  );
}

function ContactSection() {
  const { t } = useI18n();
  return (
    <section className="contact" aria-labelledby="contact-title">
      <h2 id="contact-title">{t('landing.contactTitle')}</h2>
      <div className="contact-grid">
        <div className="contact-card">
          <h3>{t('landing.contactAddress')}</h3>
          <p><span dir="ltr">{MUNICIPALITY.plusCode}</span>, {t('landing.contactCity')}</p>
          <a href={MUNICIPALITY.mapUrl} target="_blank" rel="noopener noreferrer">{t('landing.contactMap')}</a>
        </div>
        <div className="contact-card">
          <h3>{t('landing.contactPhone')}</h3>
          <p><a className="contact-phone" href={MUNICIPALITY.phoneHref} dir="ltr">{MUNICIPALITY.phone}</a></p>
        </div>
        <div className="contact-card">
          <h3>{t('landing.contactHours')}</h3>
          <dl className="hours">
            <dt>{t('landing.weekdays')}</dt><dd>{t('landing.weekdayHours')}</dd>
            <dt>{t('landing.weekend')}</dt><dd className="closed">{t('landing.closed')}</dd>
          </dl>
        </div>
      </div>
    </section>
  );
}

function PublicStatsSection({ stats }) {
  const { t, fmtNum } = useI18n();
  if (stats.loading) return <Loading />;
  if (stats.error) return <ErrorBox error={stats.error} />;
  const s = stats.data;
  return (
    <section className="public-stats" aria-labelledby="stats-title">
      <h2 id="stats-title">{t('landing.statsTitle')}</h2>
      <div className="figures">
        <div className="figure"><strong>{fmtNum(s.totals.total)}</strong><span>{t('landing.statsTotal')}</span></div>
        <div className="figure"><strong>{fmtNum(s.totals.resolved)}</strong><span>{t('landing.statsResolved')}</span></div>
        <div className="figure"><strong>{fmtNum(s.totals.open)}</strong><span>{t('landing.statsOpen')}</span></div>
        {s.totals.avg_resolution_hours != null && (
          <div className="figure"><strong>{fmtNum(s.totals.avg_resolution_hours)}</strong><span>{t('landing.statsHours')}</span></div>
        )}
      </div>
      <div className="stack" style={{ '--gap': '.75rem' }}>
        <h3>{t('landing.statsByCategory')}</h3>
        {s.by_category.length ? <CategoryBars rows={s.by_category} /> : <p className="muted">{t('landing.statsNone')}</p>}
      </div>
    </section>
  );
}

export function Transparency() {
  const { t } = useI18n();
  const stats = useLoad(() => api.get('/dashboard/public', { days: 30 }), []);
  return (
    <div>
      <div className="page-head"><div><h1>{t('nav.publicStats')}</h1></div></div>
      <PublicStatsSection stats={stats} />
    </div>
  );
}

export function Login() {
  const { t } = useI18n();
  const { user, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={loc.state?.from || homeFor(user)} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const u = await login(form.email, form.password);
      nav(loc.state?.from || homeFor(u), { replace: true });
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card stack" onSubmit={submit} noValidate>
        <div className="stack" style={{ '--gap': '.4rem' }}>
          <h1>{t('auth.loginTitle')}</h1>
          <p className="muted">{t('auth.loginLead')}</p>
        </div>
        <ErrorBox error={error} messages={{ 401: t('auth.invalid'), 403: t('auth.disabled') }} />
        <div className="field">
          <label htmlFor="email">{t('fields.email')}</label>
          <input id="email" className="input" type="email" autoComplete="email" dir="ltr" required
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="pw">{t('fields.password')}</label>
          <PasswordInput id="pw" className="input" autoComplete="current-password" dir="ltr" required
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <button className="btn btn-primary btn-lg" disabled={busy} style={{ width: '100%' }}>{t('auth.loginBtn')}</button>
        <p className="muted">{t('auth.noAccount')} <Link to="/register">{t('nav.register')}</Link></p>
        <p className="demo-note">{t('auth.demo')}</p>
      </form>
    </div>
  );
}

// national ID copy: same file types and size limit as the server (MAX_UPLOAD_MB, default 5)
const ID_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const ID_MAX_MB = 5;

export function Register() {
  const { t, lang } = useI18n();
  const { user, register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', password: '', password_confirm: '' });
  const [idFile, setIdFile] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user)} replace />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // every field is required; the server checks the same rules
  const check = () => {
    const missing = Object.entries(form).filter(([, v]) => !v.trim()).map(([k]) => k);
    if (missing.length || !idFile) return t('auth.allRequired');
    if (!ID_TYPES.includes(idFile.type)) return t('auth.idType');
    if (idFile.size > ID_MAX_MB * 1024 * 1024) return t('auth.idSize', { mb: ID_MAX_MB });
    if (form.password !== form.password_confirm) return t('auth.pwMismatch');
    return null;
  };

  const submit = async (e) => {
    e.preventDefault();
    const problem = check();
    if (problem) { setError({ status: 400, message: problem }); return; }
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, k.startsWith('password') ? v : v.trim()));
      fd.append('language', lang);
      fd.append('national_id', idFile);
      await register(fd);
      nav('/report', { replace: true });
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card stack" onSubmit={submit} noValidate>
        <div className="stack" style={{ '--gap': '.4rem' }}>
          <h1>{t('auth.registerTitle')}</h1>
          <p className="muted">{t('auth.registerLead')}</p>
        </div>
        <ErrorBox error={error} messages={{ 409: t('auth.exists') }} />
        <div className="form-2">
          <div className="field">
            <label htmlFor="fn">{t('auth.firstName')}</label>
            <input id="fn" className="input" autoComplete="given-name" dir="auto" required maxLength={60}
              value={form.first_name} onChange={set('first_name')} />
          </div>
          <div className="field">
            <label htmlFor="ln">{t('auth.lastName')}</label>
            <input id="ln" className="input" autoComplete="family-name" dir="auto" required maxLength={60}
              value={form.last_name} onChange={set('last_name')} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="email">{t('fields.email')}</label>
          <input id="email" className="input" type="email" autoComplete="email" dir="ltr" required value={form.email} onChange={set('email')} />
        </div>
        <div className="field">
          <label htmlFor="phone">{t('fields.phone')}</label>
          <input id="phone" className="input" type="tel" autoComplete="tel" dir="ltr" required placeholder="03 123 456"
            value={form.phone} onChange={set('phone')} />
        </div>
        <div className="field">
          <label htmlFor="nid">{t('auth.nationalId')}</label>
          <input id="nid" className="input" type="file" required accept={ID_TYPES.join(',')}
            onChange={(e) => setIdFile(e.target.files[0] || null)} />
          <span className="hint">{t('auth.nationalIdHint', { mb: ID_MAX_MB })}</span>
        </div>
        <div className="field">
          <label htmlFor="pw">{t('fields.password')}</label>
          <PasswordInput id="pw" className="input" autoComplete="new-password" dir="ltr" required value={form.password} onChange={set('password')} />
          <span className="hint">{t('auth.pwHint')}</span>
        </div>
        <div className="field">
          <label htmlFor="pw2">{t('auth.pwConfirm')}</label>
          <PasswordInput id="pw2" className="input" autoComplete="new-password" dir="ltr" required
            value={form.password_confirm} onChange={set('password_confirm')} />
          {form.password_confirm && form.password !== form.password_confirm && (
            <span className="loc-error" role="status">{t('auth.pwMismatch')}</span>
          )}
        </div>
        <button className="btn btn-primary btn-lg" disabled={busy} style={{ width: '100%' }}>{t('auth.registerBtn')}</button>
        <p className="muted">{t('auth.haveAccount')} <Link to="/login">{t('nav.login')}</Link></p>
      </form>
    </div>
  );
}
