import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n, LANGS } from '../i18n';

export function BrandMark({ className = 'brand-mark' }) {
  // Official coat of arms of the Municipality of Beirut
  return <img className={className} src="/beirut-shield.png" alt="" aria-hidden="true" />;
}

export function Brand({ to = '/' }) {
  const { t } = useI18n();
  return (
    <Link to={to} className="brand">
      <BrandMark />
      <span className="brand-text">
        {t('app.municipality')}
        <small>{t('app.name')} · {t('app.full')}</small>
      </span>
    </Link>
  );
}

export function LangSwitch({ onChange }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label={t('lang.label')}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          onClick={() => { setLang(l); onChange?.(l); }}
        >
          {l === 'ar' ? 'ع' : l.toUpperCase()}
          <span className="sr-only"> {t(`lang.${l}`)}</span>
        </button>
      ))}
    </div>
  );
}

export function Prio({ value }) {
  const { t } = useI18n();
  if (!value) return null;
  return <span className={`prio prio-${value}`}>{t(`priority.${value}`)}</span>;
}

export function Stamp({ value }) {
  const { t } = useI18n();
  return <span className={`stamp st-${value}`}>{t(`status.${value}`)}</span>;
}

export function Loading() {
  const { t } = useI18n();
  return <div className="loading" role="status">{t('common.loading')}</div>;
}

/** Turns an ApiError into a readable, translated message (with field list for validation errors). */
export function ErrorBox({ error, messages = {} }) {
  const { t } = useI18n();
  if (!error) return null;
  let text = messages[error.status];
  if (!text) {
    if (error.status === 0) text = t('common.network');
    else if (error.status === 403) text = t('errors.403');
    else if (error.status === 404) text = t('errors.404');
    else if (error.status >= 500) text = t('common.error');
    else text = error.details ? t('common.validation') : error.message;
  }
  const details = Array.isArray(error.details) ? error.details : null;
  return (
    <div className="alert alert-error" role="alert">
      {text}
      {details && (
        <ul>
          {details.map((d, i) => (
            <li key={i}>{t(`fields.${d.field}`) !== `fields.${d.field}` ? t(`fields.${d.field}`) : d.field}: {d.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Empty({ children, action }) {
  return (
    <div className="empty">
      <p>{children}</p>
      {action}
    </div>
  );
}

export function Pager({ page, limit, total, onPage }) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <span>{t('common.page', { page, pages })}</span>
      <button className="btn btn-secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t('common.prev')}</button>
      <button className="btn btn-secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t('common.next')}</button>
    </div>
  );
}

/** Load data from the API; re-runs when deps change. Returns { data, error, loading, reload }. */
export function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const run = useCallback(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef.current()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState({ data: null, error, loading: false }));
    return () => { alive = false; };
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(run, deps);
  return { ...state, reload: run };
}

export function useToast() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (!msg) return undefined;
    const id = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(id);
  }, [msg]);
  const node = msg ? <div className="toast" role="status">{msg}</div> : null;
  return [node, setMsg];
}

const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  plus: 'M12 5v14M5 12h14',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  doc: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0',
  user: 'M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  users: 'M16 21a6 6 0 0 0-12 0M10 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21a5 5 0 0 0-5-5M17 4a4 4 0 0 1 0 8',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6z',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
  menu: 'M3 6h18M3 12h18M3 18h18',
  logout: 'M15 17l5-5-5-5M20 12H9M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
};

export function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Team name in the current language (built-in teams are keyed by their category). */
export function useDeptName() {
  const { t } = useI18n();
  return (name, category) => (category ? t(`dept.${category}`) : name) || '–';
}

/** History notes: staff text as written; system events (@assigned, @department, @reclassified) translated. */
export function HistoryNote({ note }) {
  const { t } = useI18n();
  if (!note) return null;
  if (!note.startsWith('@')) return <div className="note" dir="auto">{note}</div>;
  const [code, arg = ''] = note.slice(1).split(/:(.*)/s);
  if (code === 'assigned') return <div className="note">{t('history.assigned', { name: arg })}</div>;
  if (code === 'department') return <div className="note">{t('history.department')}</div>;
  if (code === 'trusted') return <div className="note">{t('history.trusted')}</div>;
  if (code === 'invalid') {
    return <><div className="note">{t('history.invalid')}</div>{arg && <div className="note" dir="auto">{arg}</div>}</>;
  }
  if (code === 'reclassified') {
    const parts = arg.split(',').map((p) => {
      const [field, change] = p.split('=');
      const [from, to] = (change || '').split('>');
      const group = field === 'category' ? 'category' : 'priority';
      return `${t(`history.${field}`)}: ${t(`${group}.${from}`)} → ${t(`${group}.${to}`)}`;
    });
    return <div className="note">{t('history.reclassified')}. {parts.join('; ')}</div>;
  }
  return null;
}

/** Password field with a show/hide toggle. Takes the same props as <input>. */
export function PasswordInput({ className = 'input', ...props }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  return (
    <div className="pw-wrap">
      <input {...props} className={className} type={shown ? 'text' : 'password'} />
      <button type="button" className="pw-toggle" onClick={() => setShown((s) => !s)}
        aria-pressed={shown} aria-label={t(shown ? 'auth.hidePassword' : 'auth.showPassword')}
        title={t(shown ? 'auth.hidePassword' : 'auth.showPassword')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {shown && <path d="M3 3l18 18" />}
        </svg>
      </button>
    </div>
  );
}
