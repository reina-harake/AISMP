import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, fetchBlobUrl } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { areaLabel } from '../beirut';
import { Empty, ErrorBox, HistoryNote, Loading, Pager, Prio, Stamp, useDeptName, useLoad, useToast } from '../components/ui';

const CATEGORIES = [
  'road_damage', 'street_lighting', 'electricity', 'water', 'waste', 'noise',
  'illegal_construction', 'parking', 'stray_animals', 'public_spaces', 'other',
];
const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const STATUSES = ['submitted', 'under_review', 'assigned', 'in_progress', 'resolved', 'rejected'];
// mirrors the backend workflow
const NEXT = {
  submitted: ['under_review', 'rejected'],
  under_review: ['assigned', 'rejected'],
  assigned: ['in_progress', 'rejected'],
  in_progress: ['resolved', 'rejected'],
  resolved: [],
  rejected: [],
};

export function ComplaintRows({ items, showCitizen = false }) {
  const { t, fmtDate, lang } = useI18n();
  return (
    <ul className="clist">
      {items.map((c) => (
        <li className="citem" key={c.complaint_id}>
          <Link to={`/complaints/${c.complaint_id}`}>
            <span className={`citem-edge edge-${c.priority}`} />
            <div className="citem-body">
              <span className="citem-title" dir="auto">{c.title}</span>
              <span className="citem-meta">
                <span>#{c.complaint_id}</span>
                <span className="chip">{t(`category.${c.category}`)}</span>
                {c.area && <span dir="auto">{areaLabel(c.area, lang)}</span>}
                <span>{fmtDate(c.created_at)}</span>
                {showCitizen && c.citizen_name && <span>{c.citizen_name}</span>}
              </span>
            </div>
            <div className="citem-side">
              <Prio value={c.priority} />
              <Stamp value={c.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Citizens: their own complaints. Staff: the queue (department-scoped by the API). */
export function ComplaintList() {
  const { t } = useI18n();
  const { user } = useAuth();
  const staff = user.role !== 'citizen';
  const [params, setParams] = useSearchParams();
  const f = Object.fromEntries(params);
  const page = Number(f.page || 1);
  const [q, setQ] = useState(f.q || '');
  const deptName = useDeptName();

  const depts = useLoad(() => (user.role === 'admin' ? api.get('/departments') : Promise.resolve(null)), []);
  const list = useLoad(
    () => api.get('/complaints', { ...f, sort: f.sort || (staff ? 'priority' : 'newest'), page, limit: 20 }),
    [params.toString()]
  );

  const setF = (k, v) => {
    const next = new URLSearchParams(params);
    v ? next.set(k, v) : next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next);
  };

  const title = !staff ? t('complaint.listTitle') : user.role === 'admin' ? t('complaint.allTitle') : t('complaint.queueTitle');

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {user.role === 'employee' && <p>{t('complaint.queueLead')}</p>}
        </div>
        <span className="spacer" />
        {!staff && <Link className="btn btn-primary" to="/report">{t('nav.newComplaint')}</Link>}
      </div>

      <form className="toolbar" role="search" onSubmit={(e) => { e.preventDefault(); setF('q', q.trim()); }}>
        <label className="sr-only" htmlFor="q">{t('common.search')}</label>
        <input id="q" className="input" dir="auto" placeholder={t('complaint.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select label={t('complaint.aiCategory')} value={f.category} onChange={(v) => setF('category', v)}
          options={CATEGORIES.map((c) => [c, t(`category.${c}`)])} allLabel={t('complaint.aiCategory')} />
        <Select label={t('complaint.aiPriority')} value={f.priority} onChange={(v) => setF('priority', v)}
          options={PRIORITIES.map((p) => [p, t(`priority.${p}`)])} allLabel={t('complaint.aiPriority')} />
        <Select label={t('fields.status')} value={f.status} onChange={(v) => setF('status', v)}
          options={STATUSES.map((s) => [s, t(`status.${s}`)])} allLabel={t('fields.status')} />
        {depts.data && (
          <Select label={t('complaint.department')} value={f.department_id} onChange={(v) => setF('department_id', v)}
            options={depts.data.items.map((d) => [String(d.department_id), deptName(d.name, d.category)])} allLabel={t('complaint.department')} />
        )}
        <Select label={t('common.sort')} value={f.sort || (staff ? 'priority' : 'newest')} onChange={(v) => setF('sort', v)} noAll
          options={[['priority', t('complaint.sortPriority')], ['newest', t('complaint.sortNewest')], ['oldest', t('complaint.sortOldest')]]} />
        {user.role === 'employee' && (
          <label className="row faint" style={{ gap: '.4rem' }}>
            <input type="checkbox" checked={f.assigned_to_me === 'true'} onChange={(e) => setF('assigned_to_me', e.target.checked ? 'true' : '')} />
            {t('complaint.mine')}
          </label>
        )}
        {[...params.keys()].length > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => { setQ(''); setParams({}); }}>{t('common.clear')}</button>
        )}
      </form>

      {list.loading ? <Loading /> : list.error ? <ErrorBox error={list.error} /> : list.data.items.length === 0 ? (
        <div className="panel"><Empty>{t('complaint.none')}</Empty></div>
      ) : (
        <>
          <ComplaintRows items={list.data.items} showCitizen={staff} />
          <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={(p) => setF('page', String(p))} />
        </>
      )}
    </div>
  );
}

function Select({ label, value, onChange, options, allLabel, noAll }) {
  const { t } = useI18n();
  return (
    <select className="select" aria-label={label} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      {!noAll && <option value="">{allLabel}: {t('common.all')}</option>}
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

function Attachment({ complaintId, att }) {
  const [url, setUrl] = useState(null);
  const isImg = att.mime_type.startsWith('image/');
  useEffect(() => {
    let u;
    fetchBlobUrl(`/complaints/${complaintId}/attachments/${att.attachment_id}`)
      .then((x) => { u = x; setUrl(x); }).catch(() => {});
    return () => u && URL.revokeObjectURL(u);
  }, [complaintId, att.attachment_id]);
  if (!url) return <span className="thumb">…</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="thumb" title={att.original_name}>
      {isImg ? <img src={url} alt={att.original_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'PDF'}
    </a>
  );
}

export function ComplaintDetail() {
  const { id } = useParams();
  const { t, fmtDate, lang } = useI18n();
  const { user } = useAuth();
  const d = useLoad(() => api.get(`/complaints/${id}`), [id]);
  const [toast, showToast] = useToast();
  const deptName = useDeptName();

  if (d.loading) return <Loading />;
  if (d.error) return <ErrorBox error={d.error} />;
  const { complaint: c, history, attachments } = d.data;
  const staff = user.role !== 'citizen';

  return (
    <div>
      {toast}
      <Link to={staff ? '/queue' : '/complaints'} className="faint">{t('common.back')}</Link>
      <div className="dossier-head" style={{ marginBlockStart: '.75rem' }}>
        <div className="row">
          <span className="faint">#{c.complaint_id}</span>
          <Prio value={c.priority} />
          <Stamp value={c.status} />
          <span className="chip">{t(`category.${c.category}`)}</span>
        </div>
        <h1 dir="auto">{c.title}</h1>
      </div>

      <div className="grid-side">
        <div className="stack" style={{ '--gap': '1.25rem' }}>
          <section className="panel">
            <p className="desc" dir="auto">{c.description}</p>
          </section>

          <section className="panel">
            <dl className="facts">
              <dt>{t('complaint.submitted')}</dt><dd>{fmtDate(c.created_at, true)}</dd>
              {staff && <><dt>{t('complaint.citizen')}</dt><dd>{c.citizen_name}</dd></>}
              {c.area && <><dt>{t('fields.area')}</dt><dd dir="auto">{areaLabel(c.area, lang)}</dd></>}
              {c.address && <><dt>{t('fields.address')}</dt><dd dir="auto">{c.address}</dd></>}
              {c.latitude != null && (
                <><dt>{t('complaint.location')}</dt>
                  <dd><a href={`https://www.openstreetmap.org/?mlat=${c.latitude}&mlon=${c.longitude}#map=18/${c.latitude}/${c.longitude}`}
                    target="_blank" rel="noreferrer" dir="ltr">{c.latitude}, {c.longitude}</a></dd></>
              )}
              <dt>{t('complaint.department')}</dt><dd>{deptName(c.department_name, c.department_category)}</dd>
              <dt>{t('complaint.assignedTo')}</dt><dd>{c.assigned_employee_name || t('complaint.unassigned')}</dd>
              <dt>{t('complaint.aiLanguage')}</dt><dd>{t(`textLang.${c.language}`)}</dd>
              {staff && (
                <>
                  <dt>{t('complaint.aiCategory')}</dt>
                  <dd>{t(`source.${c.category_source}`)}{c.category_confidence != null && c.category_source === 'ai' && ` (${Math.round(c.category_confidence * 100)}%)`}</dd>
                  <dt>{t('complaint.aiPriority')}</dt><dd>{t(`source.${c.priority_source}`)}</dd>
                </>
              )}
            </dl>
          </section>

          <section className="panel">
            <h2>{t('complaint.attachments')}</h2>
            {attachments.length ? (
              <div className="thumbs">{attachments.map((a) => <Attachment key={a.attachment_id} complaintId={c.complaint_id} att={a} />)}</div>
            ) : <p className="muted">{t('complaint.noAttachments')}</p>}
          </section>

          {staff && <StaffActions c={c} onDone={(m) => { showToast(m); d.reload(); }} />}
        </div>

        <section className="panel">
          <h2>{t('complaint.history')}</h2>
          <ol className="timeline">
            {history.map((h) => (
              <li key={h.status_id} className={h.status === 'rejected' ? 'bad' : 'done'}>
                <Stamp value={h.status} />
                <div className="when">{fmtDate(h.created_at, true)}{h.changed_by_name && staff ? ` – ${h.changed_by_name}` : ''}</div>
                <HistoryNote note={h.note} />
              </li>
            ))}
            {NEXT[c.status].filter((s) => s !== 'rejected').slice(0, 1).map((s) => (
              <li key={s}><span className="faint">{t(`status.${s}`)}</span></li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function StaffActions({ c, onDone }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const options = NEXT[c.status];

  return (
    <>
      <section className="panel">
        <h2>{t('staff.status')}</h2>
        {options.length ? <StatusForm key={c.status} c={c} options={options} onDone={onDone} /> : <p className="muted">{t('staff.closed')}</p>}
      </section>
      {user.role === 'admin' && options.length > 0 && <AssignForm c={c} onDone={onDone} />}
      {options.length > 0 && <ClassifyForm c={c} onDone={onDone} />}
    </>
  );
}

function StatusForm({ c, options, onDone }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [status, setStatus] = useState(options[0]);
  const [note, setNote] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const unassigned = status === 'assigned' && !c.assigned_employee_id;
  const needsAssign = unassigned && user.role === 'admin';

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (status === 'rejected' && !note.trim()) { setError({ status: 400, message: t('staff.noteRequired') }); return; }
    setBusy(true);
    try {
      await api.patch(`/complaints/${c.complaint_id}/status`, {
        status, ...(note.trim() ? { note: note.trim() } : {}), ...(status === 'rejected' && invalid ? { invalid: true } : {}),
      });
      setNote('');
      onDone(t('staff.updated'));
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <form className="form-grid" onSubmit={submit}>
      <ErrorBox error={error} />
      <div className="field">
        <label htmlFor="st">{t('staff.moveTo')}</label>
        <select id="st" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          {options.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </select>
      </div>
      {needsAssign && <div className="alert alert-error">{t('staff.needAssign')}</div>}
      {unassigned && !needsAssign && <div className="alert alert-ok">{t('staff.selfAssign')}</div>}
      <div className="field">
        <label htmlFor="note">{t('staff.note')}</label>
        <textarea id="note" className="textarea" style={{ minHeight: '4.5rem' }} dir="auto" placeholder={t('staff.notePh')}
          value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {status === 'rejected' && (
        <label className="row faint" style={{ gap: '.4rem', alignItems: 'flex-start' }}>
          <input type="checkbox" checked={invalid} onChange={(e) => setInvalid(e.target.checked)} />
          <span>{t('staff.invalid')}</span>
        </label>
      )}
      <div><button className={`btn ${status === 'rejected' ? 'btn-danger' : 'btn-primary'}`} disabled={busy || needsAssign}>{t('staff.apply')}</button></div>
    </form>
  );
}

function AssignForm({ c, onDone }) {
  const { t } = useI18n();
  const depts = useLoad(() => api.get('/departments'), []);
  const deptName = useDeptName();
  const [dept, setDept] = useState(String(c.department_id || ''));
  const emps = useLoad(() => (dept ? api.get(`/departments/${dept}/employees`) : Promise.resolve({ items: [] })), [dept]);
  const [emp, setEmp] = useState(c.assigned_employee_id ? String(c.assigned_employee_id) : '');
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault(); setError(null);
    try {
      await api.patch(`/complaints/${c.complaint_id}/assign`, emp ? { employee_id: Number(emp) } : { department_id: Number(dept) });
      onDone(t('staff.assigned'));
    } catch (err) { setError(err); }
  };

  return (
    <form className="panel form-grid" onSubmit={submit}>
      <h2 style={{ margin: 0 }}>{t('staff.assignTitle')}</h2>
      <p className="panel-lead" style={{ margin: 0 }}>{t('staff.assignLead')}</p>
      <ErrorBox error={error} />
      <div className="form-2">
        <div className="field">
          <label htmlFor="dept">{t('staff.pickDept')}</label>
          <select id="dept" className="select" value={dept} onChange={(e) => { setDept(e.target.value); setEmp(''); }}>
            {depts.data?.items.map((d) => <option key={d.department_id} value={d.department_id}>{deptName(d.name, d.category)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="emp">{t('staff.pickEmployee')}</label>
          <select id="emp" className="select" value={emp} onChange={(e) => setEmp(e.target.value)}>
            <option value="">{t('staff.noEmployee')}</option>
            {emps.data?.items.map((x) => (
              <option key={x.employee_id} value={x.employee_id}>{x.name} ({t('staff.workload', { n: x.open_workload })})</option>
            ))}
          </select>
        </div>
      </div>
      <div><button className="btn btn-primary">{t('staff.assignBtn')}</button></div>
    </form>
  );
}

function ClassifyForm({ c, onDone }) {
  const { t } = useI18n();
  const [cat, setCat] = useState(c.category);
  const [prio, setPrio] = useState(c.priority);
  const [error, setError] = useState(null);
  const changed = cat !== c.category || prio !== c.priority;

  const submit = async (e) => {
    e.preventDefault(); setError(null);
    try {
      const body = {};
      if (cat !== c.category) body.category = cat;
      if (prio !== c.priority) body.priority = prio;
      await api.patch(`/complaints/${c.complaint_id}/classification`, body);
      onDone(t('staff.classSaved'));
    } catch (err) { setError(err); }
  };

  return (
    <form className="panel form-grid" onSubmit={submit}>
      <h2 style={{ margin: 0 }}>{t('staff.classTitle')}</h2>
      <p className="panel-lead" style={{ margin: 0 }}>{t('staff.classLead')}</p>
      <ErrorBox error={error} />
      <div className="form-2">
        <div className="field">
          <label htmlFor="ccat">{t('complaint.aiCategory')}</label>
          <select id="ccat" className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
            {CATEGORIES.map((x) => <option key={x} value={x}>{t(`category.${x}`)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cprio">{t('complaint.aiPriority')}</label>
          <select id="cprio" className="select" value={prio} onChange={(e) => setPrio(e.target.value)}>
            {PRIORITIES.map((x) => <option key={x} value={x}>{t(`priority.${x}`)}</option>)}
          </select>
        </div>
      </div>
      <div><button className="btn btn-secondary" disabled={!changed}>{t('staff.classBtn')}</button></div>
    </form>
  );
}
