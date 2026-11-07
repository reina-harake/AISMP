import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { Prio, Stamp } from './ui';

const STORE = 'aismp_chat';

function load() {
  try { return JSON.parse(sessionStorage.getItem(STORE)) || []; } catch { return []; }
}
function save(msgs) {
  try { sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-40))); } catch { /* ignore */ }
}

/** Floating municipality assistant, available on every page. */
export default function ChatWidget() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState(load);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => save(msgs), [msgs]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy, open]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  // a different person signing in (or signing out) starts a fresh conversation
  const lastUser = useRef(user?.user_id);
  useEffect(() => {
    if (lastUser.current !== user?.user_id) setMsgs([]);
    lastUser.current = user?.user_id;
  }, [user?.user_id]);

  const push = (m) => setMsgs((list) => [...list, { id: `${Date.now()}-${Math.random()}`, ...m }]);

  const ask = async (body, shown) => {
    if (busy) return;
    if (shown) push({ from: 'me', text: shown });
    setBusy(true);
    try {
      const r = await api.post('/chat', { ...body, lang });
      push({ from: 'bot', ...r });
    } catch {
      push({ from: 'bot', messages: [t('chat.error')] });
    } finally {
      setBusy(false);
    }
  };

  const send = (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    ask({ message: text }, text);
  };

  const onButton = (b, msg) => {
    if (b.to) {
      nav(b.to);
      if (window.matchMedia('(max-width: 640px)').matches) setOpen(false);
    } else if (b.send) {
      ask({ message: b.send }, b.send);
    } else if (b.action === 'submit_complaint' && msg.offer) {
      setMsgs((list) => list.map((m) => (m.id === msg.id ? { ...m, used: true } : m)));
      ask({ action: 'submit_complaint', text: msg.offer.text, ...(b.area ? { area: b.area } : {}) }, b.label);
    }
  };

  const starters = [t('chat.s1'), t('chat.s2'), t('chat.s3')];

  return (
    <>
      {!open && (
        <button className="chat-fab" onClick={() => setOpen(true)} aria-label={t('chat.open')}>
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" />
            <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" strokeWidth="2.6" />
          </svg>
          <span className="chat-fab-label">{t('chat.title')}</span>
        </button>
      )}

      {open && (
        <section className="chat" role="dialog" aria-label={t('chat.title')}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
          <header className="chat-head">
            <div>
              <strong>{t('chat.title')}</strong>
              <span>{t('chat.langs')}</span>
            </div>
            <span className="spacer" />
            {msgs.length > 0 && (
              <button className="btn btn-ghost chat-icon" onClick={() => setMsgs([])}>{t('chat.reset')}</button>
            )}
            <button className="btn btn-ghost chat-icon" onClick={() => setOpen(false)} aria-label={t('common.close')}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>

          <div className="chat-body" ref={listRef} aria-live="polite">
            <div className="bubble bot">
              <p>{user ? t('chat.introUser', { name: user.name.split(' ')[0] }) : t('chat.intro')}</p>
            </div>
            {msgs.length === 0 && (
              <div className="chat-chips">
                {starters.map((s) => <button key={s} className="chip-btn" onClick={() => ask({ message: s }, s)}>{s}</button>)}
              </div>
            )}

            {msgs.map((m) => (m.from === 'me' ? (
              <div key={m.id} className="bubble me" dir="auto">{m.text}</div>
            ) : (
              <div key={m.id} className="bot-turn">
                <div className="bubble bot">
                  {(m.messages || []).map((p, i) => <p key={i}>{p}</p>)}
                  {m.items?.length > 0 && (
                    <ul className="chat-items">
                      {m.items.map((it) => (
                        <li key={`${it.kind}-${it.id}`}>
                          <Link to={it.to}>
                            <span className="chat-item-title" dir="auto">#{it.id} {it.title}</span>
                            <span className="row" style={{ gap: '.35rem' }}>
                              {it.priority && <Prio value={it.priority} />}
                              <Stamp value={it.status} />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {m.buttons?.length > 0 && (
                  <div className="chat-chips">
                    {m.buttons.map((b, i) => (/^(https:|tel:)/.test(b.href || '') ? (
                      // outside links (Google Maps, phone call): only https: and tel: are allowed
                      <a key={i} className="chip-btn" href={b.href} dir="auto"
                        {...(b.href.startsWith('https:') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                        {b.label}
                      </a>
                    ) : (
                      <button key={i}
                        className={`chip-btn${b.action ? ' primary' : ''}`}
                        disabled={(b.action && m.used) || busy}
                        onClick={() => onButton(b, m)}>
                        {b.label}
                      </button>
                    )))}
                  </div>
                )}
              </div>
            )))}
            {busy && <div className="bubble bot typing" aria-label={t('chat.typing')}><span /><span /><span /></div>}
          </div>

          <form className="chat-input" onSubmit={send}>
            <label className="sr-only" htmlFor="chat-in">{t('chat.placeholder')}</label>
            <textarea id="chat-in" ref={inputRef} rows={1} dir="auto" maxLength={2000}
              placeholder={t('chat.placeholder')} value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }} />
            <button className="btn btn-primary" disabled={busy || !input.trim()} aria-label={t('chat.send')}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="send-icon">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
        </section>
      )}
    </>
  );
}
