import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { Empty, ErrorBox, Icon, Loading, PasswordInput, useLoad } from '../components/ui';
import { ComplaintRows } from './Complaints';
import MapPicker from '../components/MapPicker';
import { AREAS, insideBeirut } from '../beirut';

export function CitizenHome() {
  const { t, fmtNum, fmtDate } = useI18n();
  const { user, refresh } = useAuth();
  const list = useLoad(() => api.get('/complaints', { sort: 'newest', limit: 50 }), []);
  const notif = useLoad(() => api.get('/notifications'), []);
  // points change when staff resolve or reject complaints: reload them on every visit
  useEffect(() => { refresh().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (list.loading) return <Loading />;
  if (list.error) return <ErrorBox error={list.error} />;
  const items = list.data.items;
  const open = items.filter((c) => !['resolved', 'rejected'].includes(c.status)).length;
  const resolved = items.filter((c) => c.status === 'resolved').length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('citizen.hello', { name: user.name.split(' ')[0] })}</h1>
        </div>
        <span className="spacer" />
        <Link className="btn btn-primary" to="/report"><Icon name="plus" />{t('nav.newComplaint')}</Link>
      </div>

      <div className="kpis">
        <div className="kpi"><strong>{fmtNum(open)}</strong><span>{t('citizen.open')}</span></div>
        <div className="kpi"><strong>{fmtNum(resolved)}</strong><span>{t('citizen.resolved')}</span></div>
        <div className="kpi">
          <div className="points">
            <span className="points-num">{fmtNum(user.points)}</span>
            <div className="stack" style={{ '--gap': '.3rem' }}>
              {user.level && <span className={`level-badge level-${user.level}`}>{t(`level.${user.level}`)}</span>}
              {user.next_level ? (
                <>
                  <div className="level-track" aria-hidden="true">
                    <div className="level-fill" style={{ width: `${Math.min(100, (user.points / user.next_level_at) * 100)}%` }} />
                  </div>
                  <span className="faint">
                    {t('citizen.nextLevel', { points: fmtNum(user.next_level_at - user.points), level: t(`level.${user.next_level}`) })}
                  </span>
                </>
              ) : null}
              <span className="faint">{user.fast_track ? t('citizen.fastTrackOn') : t('citizen.pointsHint')}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-side">
        <section className="stack" style={{ '--gap': '.75rem' }}>
          <h2>{t('citizen.recent')}</h2>
          {items.length ? (
            <ComplaintRows items={items.slice(0, 6)} />
          ) : (
            <div className="panel">
              <Empty action={<Link className="btn btn-primary" to="/report">{t('citizen.emptyCta')}</Link>}>
                {t('citizen.empty')}
              </Empty>
            </div>
          )}
          {items.length > 6 && <Link to="/complaints">{t('nav.myComplaints')}</Link>}
        </section>

        <section className="panel">
          <h2>{t('citizen.latest')}</h2>
          {notif.data?.items?.length ? (
            <ul className="timeline">
              {notif.data.items.slice(0, 5).map((n) => (
                <li key={n.notification_id} className={n.is_read ? '' : 'done'}>
                  <div className="when">{fmtDate(n.created_at, true)}</div>
                  <div className="note" style={{ color: 'var(--ink)' }}>
                    {n.link ? <Link to={n.link}>{n.message}</Link> : n.message}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="muted">{t('notif.none')}</p>}
        </section>
      </div>
    </div>
  );
}

/** The signature moment: show how the platform read the complaint. */
function Reading({ result, onAnother }) {
  const { t, fmtNum } = useI18n();
  const { complaint: c, ai } = result;
  const fallback = ai.classification.source === 'fallback';
  const probs = Object.entries(ai.classification.probabilities || {}).sort((a, b) => b[1] - a[1]);
  const pct = (v) => `${Math.round(v * 100)}%`;

  return (
    <section className="reading" aria-live="polite">
      <div className="stack" style={{ '--gap': '.5rem' }}>
        <h1>{t('complaint.aiTitle', { id: c.complaint_id })}</h1>
        <p className="lead">{fallback ? t('complaint.aiFallback') : t('complaint.aiLead')}</p>
      </div>

      <div className="reading-grid">
        <div className="reading-cell">
          <span>{t('complaint.aiCategory')}</span>
          <strong>{t(`category.${c.category}`)}</strong>
          {c.category_confidence != null && (
            <div className="conf">{pct(c.category_confidence)} {t('complaint.aiConfidence')}</div>
          )}
        </div>
        <div className="reading-cell">
          <span>{t('complaint.aiPriority')}</span>
          <strong className={`reading-prio-${c.priority}`}>{t(`priority.${c.priority}`)}</strong>
          {ai.similar_recent_count > 0 && (
            <div className="conf">{t('complaint.aiSimilar', { n: fmtNum(ai.similar_recent_count) })}</div>
          )}
        </div>
        <div className="reading-cell">
          <span>{t('complaint.aiLanguage')}</span>
          <strong>{t(`textLang.${c.language}`)}</strong>
        </div>
      </div>

      {probs.length > 0 && (
        <div className="prob">
          {probs.map(([k, v]) => (
            <div className="prob-row" key={k}>
              <span>{t(`category.${k}`)}</span>
              <div className="prob-track"><div className="prob-fill" style={{ width: pct(Math.max(v, 0.01)) }} /></div>
              <span className="pct">{pct(v)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="row">
        <Link className="btn btn-primary" to={`/complaints/${c.complaint_id}`}>{t('complaint.view')}</Link>
        <button className="btn btn-secondary" onClick={onAnother}>{t('complaint.another')}</button>
      </div>
    </section>
  );
}

export function Report() {
  const { t, lang } = useI18n();
  const [params] = useSearchParams();
  const empty = { title: '', description: '', area: '', address: '' };
  const [form, setForm] = useState(() => ({
    ...empty,
    title: (params.get('title') || '').slice(0, 200),
    description: (params.get('description') || '').slice(0, 5000),
    area: AREAS.some((a) => a.value === params.get('area')) ? params.get('area') : '',
  }));
  const [files, setFiles] = useState([]);
  const [loc, setLoc] = useState(null);
  const [locMsg, setLocMsg] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const useLocation = () => {
    if (!navigator.geolocation) { setLocMsg(t('complaint.locationFailed')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (!insideBeirut(p.coords.latitude, p.coords.longitude)) { setLoc(null); setLocMsg(t('complaint.locationOutside')); return; }
        setLoc({ latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) });
        setLocMsg(t('complaint.locationSet'));
      },
      () => setLocMsg(t('complaint.locationFailed')),
      { timeout: 8000 }
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.area) { setError({ status: 400, message: t('complaint.areaRequired') }); return; }
    setBusy(true); setError(null);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => v.trim() && fd.append(k, v.trim()));
    if (loc) { fd.append('latitude', loc.latitude); fd.append('longitude', loc.longitude); }
    files.slice(0, 5).forEach((f) => fd.append('evidence', f));
    try {
      setResult(await api.upload('/complaints', fd));
      window.scrollTo({ top: 0 });
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  if (result) {
    return (
      <Reading result={result} onAnother={() => { setResult(null); setForm(empty); setFiles([]); setLoc(null); setLocMsg(''); }} />
    );
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-head">
        <div>
          <h1>{t('complaint.newTitle')}</h1>
          <p>{t('complaint.newLead')}</p>
        </div>
      </div>
      <form className="form-grid" onSubmit={submit} noValidate>
        <ErrorBox error={error} />
        <div className="field">
          <label htmlFor="title">{t('fields.title')}</label>
          <input id="title" className="input" dir="auto" required maxLength={200} placeholder={t('complaint.titlePh')}
            value={form.title} onChange={set('title')} />
        </div>
        <div className="field">
          <label htmlFor="desc">{t('fields.description')}</label>
          <textarea id="desc" className="textarea" dir="auto" required maxLength={5000} placeholder={t('complaint.descPh')}
            value={form.description} onChange={set('description')} />
        </div>
        <div className="form-2">
          <div className="field">
            <label htmlFor="area">{t('complaint.areaBeirut')}</label>
            <select id="area" className="select" required value={form.area} onChange={set('area')}>
              <option value="">{t('complaint.areaChoose')}</option>
              {AREAS.map((a) => <option key={a.value} value={a.value}>{a[lang] || a.en}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="address">{t('fields.address')} <span className="faint">({t('common.optional')})</span></label>
            <input id="address" className="input" dir="auto" placeholder={t('complaint.addressPh')} value={form.address} onChange={set('address')} />
          </div>
        </div>
        <div className="field">
          <label>{t('complaint.location')} <span className="faint">({t('common.optional')})</span></label>
          <span className="hint">{t('complaint.mapHint')}</span>
          <MapPicker
            value={loc}
            label={t('complaint.location')}
            onChange={(v) => { setLoc(v); setLocMsg(t('complaint.locationSet')); }}
            onOutside={() => { setLoc(null); setLocMsg(t('complaint.locationOutside')); }}
          />
          <div className="row">
            <button type="button" className="btn btn-secondary" onClick={useLocation}><Icon name="pin" />{t('complaint.useLocation')}</button>
            {loc && <button type="button" className="btn btn-secondary" onClick={() => { setLoc(null); setLocMsg(''); }}>{t('complaint.clearLocation')}</button>}
            {locMsg && (
              <span className={loc ? 'faint' : 'loc-error'} role="status">{locMsg}{loc && ` (${loc.latitude}, ${loc.longitude})`}</span>
            )}
          </div>
        </div>
        <div className="field">
          <label htmlFor="files">{t('complaint.evidence')} <span className="faint">({t('common.optional')})</span></label>
          <input id="files" className="input" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setFiles([...e.target.files])} />
          <span className="hint">{t('complaint.evidenceHint')}</span>
        </div>
        <div>
          <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? t('complaint.sending') : t('complaint.send')}</button>
        </div>
      </form>
    </div>
  );
}

export function Notifications() {
  const { t, fmtDate } = useI18n();
  const n = useLoad(() => api.get('/notifications'), []);
  const markAll = async () => { await api.patch('/notifications/read-all'); n.reload(); };
  const markOne = (id) => api.patch(`/notifications/${id}/read`).catch(() => {});

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="page-head">
        <div><h1>{t('notif.title')}</h1></div>
        <span className="spacer" />
        {n.data?.unread > 0 && <button className="btn btn-secondary" onClick={markAll}>{t('notif.markAll')}</button>}
      </div>
      {n.loading ? <Loading /> : n.error ? <ErrorBox error={n.error} /> : n.data.items.length === 0 ? (
        <div className="panel"><Empty>{t('notif.none')}</Empty></div>
      ) : (
        <ul className="nlist">
          {n.data.items.map((x) => (
            <li key={x.notification_id} className={`nitem${x.is_read ? '' : ' unread'}`}>
              <span className="ndot" />
              <div>
                <div className="nmsg" dir="auto">{x.message}</div>
                <div className="faint">{fmtDate(x.created_at, true)}</div>
              </div>
              {x.link && <Link className="btn btn-ghost" to={x.link} onClick={() => markOne(x.notification_id)}>{t('notif.open')}</Link>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Profile() {
  const { t, setLang } = useI18n();
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState({ name: user.name, phone: user.phone || '', language: user.language });
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [pwMsg, setPwMsg] = useState(null);
  const [pwError, setPwError] = useState(null);

  const save = async (e) => {
    e.preventDefault(); setMsg(null); setError(null);
    try {
      const body = { name: form.name, language: form.language };
      if (form.phone) body.phone = form.phone;
      await updateProfile(body);
      setLang(form.language);
      setMsg(t('profile.saved'));
    } catch (err) { setError(err); }
  };

  const changePw = async (e) => {
    e.preventDefault(); setPwMsg(null); setPwError(null);
    try {
      await api.post('/auth/change-password', pw);
      setPw({ current_password: '', new_password: '' });
      setPwMsg(t('profile.pwDone'));
    } catch (err) { setPwError(err); }
  };

  return (
    <div style={{ maxWidth: 640 }} className="stack">
      <div className="page-head" style={{ marginBlockEnd: 0 }}>
        <div><h1>{t('profile.title')}</h1><p>{t('profile.lead')}</p></div>
      </div>
      <form className="panel form-grid" onSubmit={save}>
        {msg && <div className="alert alert-ok" role="status">{msg}</div>}
        <ErrorBox error={error} />
        <div className="field">
          <label htmlFor="pname">{t('fields.name')}</label>
          <input id="pname" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="form-2">
          <div className="field">
            <label htmlFor="pphone">{t('fields.phone')}</label>
            <input id="pphone" className="input" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="plang">{t('fields.language')}</label>
            <select id="plang" className="select" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
              {['en', 'ar', 'fr'].map((l) => <option key={l} value={l}>{t(`lang.${l}`)}</option>)}
            </select>
          </div>
        </div>
        <div className="field"><span className="faint">{t('fields.email')}: <span dir="ltr">{user.email}</span></span></div>
        <div><button className="btn btn-primary">{t('profile.save')}</button></div>
      </form>

      <form className="panel form-grid" onSubmit={changePw}>
        <h2 style={{ margin: 0 }}>{t('profile.pwTitle')}</h2>
        {pwMsg && <div className="alert alert-ok" role="status">{pwMsg}</div>}
        <ErrorBox error={pwError} messages={{ 400: pwError?.details ? undefined : t('profile.pwWrong') }} />
        <div className="form-2">
          <div className="field">
            <label htmlFor="cpw">{t('fields.current_password')}</label>
            <PasswordInput id="cpw" className="input" dir="ltr" autoComplete="current-password" value={pw.current_password}
              onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="npw">{t('fields.new_password')}</label>
            <PasswordInput id="npw" className="input" dir="ltr" autoComplete="new-password" value={pw.new_password}
              onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
            <span className="hint">{t('auth.pwHint')}</span>
          </div>
        </div>
        <div><button className="btn btn-secondary">{t('profile.pwBtn')}</button></div>
      </form>
    </div>
  );
}
