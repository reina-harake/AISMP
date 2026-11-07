import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fetchBlobUrl } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { areaLabel } from '../beirut';
import { Empty, ErrorBox, Loading, Pager, useDeptName, useLoad, useToast } from '../components/ui';
import { CategoryBars, DailyChart } from './charts';

const PRIO_COLORS = { critical: '#9e1b1f', high: '#b86e00', medium: '#0b476c', low: '#a39a8c' };
const PRIO_ORDER = ['critical', 'high', 'medium', 'low'];
const STATUS_ORDER = ['submitted', 'under_review', 'assigned', 'in_progress', 'resolved', 'rejected'];

/** Dashboard for admins (all) and employees (their department; the API scopes it). */
export function Dashboard() {
  const { t, fmtNum, lang } = useI18n();
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const deptName = useDeptName();
  const s = useLoad(() => api.get('/dashboard/stats', { days }), [days]);

  return (
    <div>
      <div className="page-head">
        <div><h1>{t('dash.title')}</h1><p>{t('dash.lead')}</p></div>
        <span className="spacer" />
        <select className="select" style={{ width: 'auto' }} aria-label={t('dash.period')} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 30, 90, 365].map((n) => <option key={n} value={n}>{t('dash.days', { n })}</option>)}
        </select>
      </div>

      {s.loading ? <Loading /> : s.error ? <ErrorBox error={s.error} /> : (() => {
        const d = s.data;
        const sortBy = (rows, order) => order.map((k) => rows.find((r) => r.key === k)).filter(Boolean);
        return (
          <div className="stack" style={{ '--gap': '1.25rem' }}>
            <div className="kpis" style={{ marginBlockEnd: 0 }}>
              <div className="kpi"><strong>{fmtNum(d.totals.total)}</strong><span>{t('dash.total')}</span></div>
              <div className="kpi"><strong>{fmtNum(d.totals.open)}</strong><span>{t('dash.open')}</span></div>
              <div className="kpi"><strong>{fmtNum(d.totals.resolved)}</strong><span>{t('dash.resolved')}</span></div>
              <div className={`kpi${d.totals.open_critical ? ' alarm' : ''}`}>
                <strong>{fmtNum(d.totals.open_critical)}</strong>
                <span>{d.totals.open_critical ? <Link to="/queue?priority=critical">{t('dash.critical')}</Link> : t('dash.critical')}</span>
              </div>
              <div className="kpi"><strong>{fmtNum(d.totals.avg_resolution_hours)}</strong><span>{t('dash.hours')}</span></div>
            </div>

            <section className="panel">
              <h2>{t('dash.daily')}</h2>
              <DailyChart rows={d.daily} days={days} />
            </section>

            <div className="grid-2">
              <section className="panel">
                <h2>{t('dash.byCategory')}</h2>
                {d.by_category.length ? <CategoryBars rows={d.by_category} /> : <p className="muted">{t('landing.statsNone')}</p>}
              </section>
              <section className="panel">
                <h2>{t('dash.byPriority')}</h2>
                <CategoryBars group="priority" rows={sortBy(d.by_priority, PRIO_ORDER).map((r) => ({ ...r, color: PRIO_COLORS[r.key] }))} />
              </section>
            </div>

            <div className="grid-2">
              <section className="panel">
                <h2>{t('dash.hotspots')}</h2>
                <p className="panel-lead">{t('dash.hotspotsLead')}</p>
                {d.hotspots.length ? (
                  <table className="t">
                    <thead><tr><th>{t('dash.area')}</th><th>{t('complaint.aiCategory')}</th><th className="num">{t('dash.count')}</th><th className="num">{t('dash.urgent')}</th></tr></thead>
                    <tbody>
                      {d.hotspots.map((h) => (
                        <tr key={`${h.area}-${h.category}`}>
                          <td dir="auto">{areaLabel(h.area, lang)}</td>
                          <td><Link to={`/queue?category=${h.category}&area=${encodeURIComponent(h.area)}`}>{t(`category.${h.category}`)}</Link></td>
                          <td className="num">{fmtNum(h.count)}</td>
                          <td className="num">{fmtNum(h.high_or_critical)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="muted">{t('dash.hotspotsNone')}</p>}
              </section>
              <section className="panel">
                <h2>{t('dash.byStatus')}</h2>
                <CategoryBars group="status" rows={sortBy(d.by_status, STATUS_ORDER)} />
              </section>
            </div>

            {user.role === 'admin' && (
              <div className="grid-2">
                <section className="panel">
                  <h2>{t('dash.departments')}</h2>
                  <table className="t">
                    <thead><tr><th>{t('complaint.department')}</th><th className="num">{t('dash.openCol')}</th><th className="num">{t('dash.resolvedCol')}</th></tr></thead>
                    <tbody>
                      {d.departments.map((x) => (
                        <tr key={x.department_id}>
                          <td><Link to={`/queue?department_id=${x.department_id}`}>{deptName(x.name, x.category)}</Link></td>
                          <td className="num">{fmtNum(x.open)}</td>
                          <td className="num">{fmtNum(x.resolved)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
                <section className="panel">
                  <h2>{t('dash.ai')}</h2>
                  <p className="panel-lead">{t('dash.aiLead')}</p>
                  <CategoryBars group="_raw" rows={[
                    { key: 'aiAuto', count: d.ai_overrides.ai_category, color: '#0B476C' },
                    { key: 'aiManual', count: d.ai_overrides.manual_category, color: '#b86e00' },
                    { key: 'aiFallback', count: d.ai_overrides.fallback_category, color: '#a39a8c' },
                  ].map((r) => ({ ...r, label: t(`dash.${r.key}`) }))} />
                </section>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

export function Users() {
  const { t, fmtDate } = useI18n();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const list = useLoad(() => api.get('/users', { q: query, role, page, limit: 20 }), [query, role, page]);
  const [toast, showToast] = useToast();
  const deptName = useDeptName();

  const toggle = async (u) => {
    try {
      await api.patch(`/users/${u.user_id}`, { is_active: !u.is_active });
      list.reload();
    } catch (err) { showToast(err.message); }
  };

  // the ID copy needs the admin's token, so it is fetched and opened as a blob in a new tab
  const viewId = async (u) => {
    const tab = window.open('', '_blank');
    try {
      const url = await fetchBlobUrl(`/users/${u.user_id}/national-id`);
      if (tab) tab.location.href = url; else window.location.href = url;
    } catch (err) { tab?.close(); showToast(t('users.idError')); }
  };

  return (
    <div>
      {toast}
      <div className="page-head">
        <div><h1>{t('users.title')}</h1><p>{t('users.lead')}</p></div>
      </div>

      <NewStaff onDone={() => { showToast(t('users.created')); list.reload(); }} />

      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q.trim()); }}>
        <input className="input" placeholder={t('users.searchPh')} aria-label={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" aria-label={t('fields.role')} value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
          <option value="">{t('fields.role')}: {t('common.all')}</option>
          {['citizen', 'employee', 'admin'].map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
        </select>
      </form>

      {list.loading ? <Loading /> : list.error ? <ErrorBox error={list.error} /> : list.data.items.length === 0 ? (
        <div className="panel"><Empty>{t('users.none')}</Empty></div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>{t('fields.name')}</th><th>{t('fields.email')}</th><th>{t('fields.role')}</th>
                  <th>{t('complaint.department')}</th><th>{t('fields.language')}</th><th className="num">{t('citizen.points')}</th>
                  <th>{t('users.idCol')}</th><th>{t('users.joined')}</th><th />
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((u) => (
                  <tr key={u.user_id} style={u.is_active ? undefined : { color: 'var(--ink-3)' }}>
                    <td><strong>{u.name}</strong>{!u.is_active && <div className="faint">{t('users.disabled')}</div>}</td>
                    <td dir="ltr" style={{ textAlign: 'start' }}>{u.email}</td>
                    <td>{t(`role.${u.role}`)}{u.job_title && <div className="faint">{u.job_title}</div>}</td>
                    <td>{u.department_name ? deptName(u.department_name, u.department_category) : '–'}</td>
                    <td>{t(`lang.${u.language}`)}</td>
                    <td className="num">{u.points}</td>
                    <td>{u.has_national_id ? <button className="btn btn-secondary" onClick={() => viewId(u)}>{t('users.viewId')}</button>
                      : <span className="faint">{u.role === 'citizen' ? t('users.noId') : '–'}</span>}</td>
                    <td>{fmtDate(u.created_at)}</td>
                    <td><button className={`btn ${u.is_active ? 'btn-danger' : 'btn-secondary'}`} onClick={() => toggle(u)}>
                      {u.is_active ? t('users.disable') : t('users.enable')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function NewStaff({ onDone }) {
  const { t } = useI18n();
  const depts = useLoad(() => api.get('/departments'), []);
  const deptName = useDeptName();
  const empty = { name: '', email: '', password: '', role: 'employee', department_id: '', job_title: '', language: 'en' };
  const [f, setF] = useState(empty);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setError(null);
    const body = { ...f };
    if (body.role === 'admin' || !body.department_id) delete body.department_id;
    if (!body.job_title) delete body.job_title;
    try {
      await api.post('/users', body);
      setF(empty); setOpen(false); onDone();
    } catch (err) { setError(err); }
  };

  if (!open) {
    return <div style={{ marginBlockEnd: '1.25rem' }}><button className="btn btn-primary" onClick={() => setOpen(true)}>{t('users.add')}</button></div>;
  }

  return (
    <form className="panel form-grid" onSubmit={submit} style={{ marginBlockEnd: '1.5rem', maxWidth: 760 }}>
      <h2 style={{ margin: 0 }}>{t('users.add')}</h2>
      <ErrorBox error={error} messages={{ 409: t('auth.exists') }} />
      <div className="form-2">
        <div className="field"><label htmlFor="sn">{t('fields.name')}</label><input id="sn" className="input" value={f.name} onChange={set('name')} /></div>
        <div className="field"><label htmlFor="se">{t('fields.email')}</label><input id="se" className="input" type="email" dir="ltr" value={f.email} onChange={set('email')} /></div>
        <div className="field">
          <label htmlFor="sr">{t('fields.role')}</label>
          <select id="sr" className="select" value={f.role} onChange={set('role')}>
            <option value="employee">{t('role.employee')}</option>
            <option value="admin">{t('role.admin')}</option>
          </select>
        </div>
        {f.role === 'employee' && (
          <div className="field">
            <label htmlFor="sd">{t('fields.department_id')}</label>
            <select id="sd" className="select" value={f.department_id} onChange={set('department_id')}>
              <option value="">–</option>
              {depts.data?.items.map((d) => <option key={d.department_id} value={d.department_id}>{deptName(d.name, d.category)}</option>)}
            </select>
          </div>
        )}
        <div className="field"><label htmlFor="sj">{t('fields.job_title')} <span className="faint">({t('common.optional')})</span></label><input id="sj" className="input" value={f.job_title} onChange={set('job_title')} /></div>
        <div className="field">
          <label htmlFor="sl">{t('fields.language')}</label>
          <select id="sl" className="select" value={f.language} onChange={set('language')}>
            {['en', 'ar', 'fr'].map((l) => <option key={l} value={l}>{t(`lang.${l}`)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sp">{t('users.tempPw')}</label>
          <input id="sp" className="input" type="text" dir="ltr" autoComplete="off" value={f.password} onChange={set('password')} />
          <span className="hint">{t('auth.pwHint')}</span>
        </div>
      </div>
      <div className="row">
        <button className="btn btn-primary">{t('users.add')}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
      </div>
    </form>
  );
}
