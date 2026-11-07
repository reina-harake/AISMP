import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { Empty, ErrorBox, Loading, Pager, Stamp, useLoad, useToast } from '../components/ui';

const TYPES = ['residence_certificate', 'civil_record', 'building_permit', 'construction_permit', 'business_license', 'other'];
const NEXT = {
  submitted: ['under_review', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved: ['ready'],
  ready: [],
  rejected: [],
};

export default function Requests() {
  const { t } = useI18n();
  const { user } = useAuth();
  const staff = user.role !== 'citizen';
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const list = useLoad(() => api.get('/requests', { page, status, limit: 20 }), [page, status]);
  const [toast, showToast] = useToast();

  return (
    <div style={{ maxWidth: 980 }}>
      {toast}
      <div className="page-head">
        <div>
          <h1>{t('requests.title')}</h1>
          <p>{staff ? t('requests.staffLead') : t('requests.lead')}</p>
        </div>
      </div>

      {!staff && <NewRequest onDone={() => { showToast(t('requests.sent')); setPage(1); list.reload(); }} />}

      {staff && (
        <div className="toolbar">
          <select className="select" aria-label={t('fields.status')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">{t('fields.status')}: {t('common.all')}</option>
            {Object.keys(NEXT).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select>
        </div>
      )}

      {list.loading ? <Loading /> : list.error ? <ErrorBox error={list.error} /> : list.data.items.length === 0 ? (
        <div className="panel"><Empty>{t('requests.none')}</Empty></div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('requests.type')}</th>
                  {staff && <th>{t('requests.from')}</th>}
                  <th>{t('fields.status')}</th>
                  <th>{t('requests.response')}</th>
                  {staff && <th>{t('staff.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((r) => (
                  <RequestRow key={r.request_id} r={r} staff={staff} onDone={() => { showToast(t('staff.updated')); list.reload(); }} />
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

function RequestRow({ r, staff, onDone }) {
  const { t, fmtDate } = useI18n();
  const options = NEXT[r.status];
  const [next, setNext] = useState(options[0] || '');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);

  const apply = async () => {
    setError(null);
    try {
      await api.patch(`/requests/${r.request_id}/status`, { status: next, ...(note.trim() ? { response_note: note.trim() } : {}) });
      setNote('');
      onDone();
    } catch (err) { setError(err); }
  };

  return (
    <tr>
      <td className="num">{r.request_id}</td>
      <td>
        <strong>{t(`reqType.${r.type}`)}</strong>
        <div className="faint">{fmtDate(r.created_at)}</div>
        {r.details && <div className="faint" dir="auto">{r.details}</div>}
      </td>
      {staff && <td>{r.citizen_name}</td>}
      <td><Stamp value={r.status} /></td>
      <td dir="auto">{r.response_note || '–'}</td>
      {staff && (
        <td style={{ minWidth: 260 }}>
          {options.length ? (
            <div className="stack" style={{ '--gap': '.4rem' }}>
              <ErrorBox error={error} />
              <div className="row" style={{ gap: '.4rem', flexWrap: 'nowrap' }}>
                <select className="select" aria-label={t('staff.moveTo')} value={next} onChange={(e) => setNext(e.target.value)}>
                  {options.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                </select>
                <button className="btn btn-secondary" onClick={apply}>{t('requests.process')}</button>
              </div>
              <input className="input" dir="auto" placeholder={t('requests.responsePh')} aria-label={t('requests.response')}
                value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          ) : '–'}
        </td>
      )}
    </tr>
  );
}

function NewRequest({ onDone }) {
  const { t } = useI18n();
  const [type, setType] = useState(TYPES[0]);
  const [details, setDetails] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setError(null); setBusy(true);
    try {
      await api.post('/requests', { type, ...(details.trim() ? { details: details.trim() } : {}) });
      setDetails('');
      onDone();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <form className="panel form-grid" onSubmit={submit} style={{ marginBlockEnd: '1.5rem' }}>
      <h2 style={{ margin: 0 }}>{t('requests.new')}</h2>
      <ErrorBox error={error} />
      <div className="form-2">
        <div className="field">
          <label htmlFor="rtype">{t('requests.type')}</label>
          <select id="rtype" className="select" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((x) => <option key={x} value={x}>{t(`reqType.${x}`)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rdet">{t('requests.details')} <span className="faint">({t('common.optional')})</span></label>
          <input id="rdet" className="input" dir="auto" placeholder={t('requests.detailsPh')} value={details} onChange={(e) => setDetails(e.target.value)} />
        </div>
      </div>
      <div><button className="btn btn-primary" disabled={busy}>{t('requests.send')}</button></div>
    </form>
  );
}
