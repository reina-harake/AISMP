/**
 * AI chatbot assistant (proposal section 3.7).
 *
 * POST /api/chat { message, lang }                          -> understand + answer
 * POST /api/chat { action: 'submit_complaint', text, area } -> file the complaint the bot proposed
 *
 * Understanding: ml-service /intent (trained classifier, EN / AR / Arabizi / FR).
 * Answers: predefined workflows backed by live data (the user's own complaints and requests),
 * written in the user's language. Works for visitors too; personal data needs a login.
 */
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { query } = require('../config/db');
const { optionalAuthenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../utils/httpError');
const { REQUEST_TYPES } = require('../utils/constants');
const ml = require('../services/mlClient');
const { analyze, createComplaint } = require('../services/complaintService');
const { label } = require('../services/messages');
const REPLIES = require('../services/chatReplies');
const MUNI = require('../config/municipality.json');
const { AREAS, areaInText, outsidePlaceInText } = require('../config/beirut');

const chatLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many messages, please slow down' },
});

const LOCALES = { en: 'en-GB', ar: 'ar-LB-u-nu-latn', fr: 'fr-FR' };

const schema = z.union([
  z.object({
    message: z.string().trim().min(1).max(2000),
    lang: z.enum(['en', 'ar', 'fr']).optional(),
  }),
  z.object({
    action: z.literal('submit_complaint'),
    text: z.string().trim().min(1).max(5000),
    area: z.enum(AREAS).optional(),
    lang: z.enum(['en', 'ar', 'fr']).optional(),
  }),
]);

function fill(str, params = {}) {
  return str.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''));
}

/** Builds a reply object; `t(key, params)` reads the reply texts in the chosen language. */
function makeCtx(req) {
  const lang = req.body.lang || req.user?.language || 'en';
  const R = REPLIES[lang] || REPLIES.en;
  const t = (key, params) => fill(R[key], params);
  const L = (group, key) => label(group, key, lang);
  const date = (d) => new Intl.DateTimeFormat(LOCALES[lang], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .format(new Date(d));
  const btn = (key, extra) => ({ label: R.btn[key], ...extra });
  return { lang, t, L, date, btn, user: req.user };
}

const citizenButtons = (c) => [
  c.btn('report', { to: '/report' }), c.btn('statusQ', { send: c.btn('statusQ').label }), c.btn('docsQ', { send: c.btn('docsQ').label }),
];
const visitorButtons = (c) => [c.btn('login', { to: '/login' }), c.btn('register', { to: '/register' }), c.btn('docsQ', { send: c.btn('docsQ').label })];
const staffButtons = (c) => [c.btn('queue', { to: '/queue' }), c.btn('documents', { to: '/requests' })];
const defaultButtons = (c) => (!c.user ? visitorButtons(c) : c.user.role === 'citizen' ? citizenButtons(c) : staffButtons(c));

/** Title for a complaint written in chat: its first sentence, cut at a word boundary. */
function titleFrom(text) {
  const first = text.split(/(?<=[.!?؟])\s|\n/)[0].trim();
  if (first.length <= 80) return first;
  const cut = first.slice(0, 80);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 30 ? cut.lastIndexOf(' ') : 80)}…`;
}

// Account questions: logging in / signing up vs. password vs. profile settings (EN / AR / Arabizi / FR)
const LOGIN_RE = new RegExp([
  String.raw`\b(log ?in|log ?out|logon|sign ?in|sign ?up|sign ?out|register|registration)\b`,
  String.raw`\b(create|make|open|need|have|no|without) (an |a )?account\b`,
  String.raw`\b(a3mol|ba3mol|fout 3al|bfout 3al|3ande|3andi) (el )?account\b`,
  'تسجيل (ال)?دخول', 'تسجيل (ال)?خروج', 'سجّ?ل دخول', 'كيف بسجّ?ل', 'اعمل حساب', 'بعمل حساب', 'عندي حساب', 'فوت عالحساب', 'بفوت عالحساب',
  'اطلع من الحساب', 'بطلع من الحساب',
  String.raw`\b(se connecter|me connecter|connexion|s'?inscrire|m'?inscrire|inscription|déconnecter|deconnecter)\b`,
  String.raw`\b(créer|creer|pas de|un) compte\b`,
].join('|'), 'i');
const PASSWORD_RE = /pass ?word|mot de passe|mdp|كلمة (ال)?سر|كلمة المرور/i;

// "When will I get an answer?", "how long until it's fixed?" (EN / AR / Arabizi / FR).
// Not for documents: "how long does a residence certificate take" stays document_info.
const RESPONSE_TIME_RE = new RegExp([
  String.raw`\b(when|how long|how much time|how soon|how many days)\b.*\b(answer|response|respond|reply|hear back|hear from|fix|fixed|resolve|resolved|solve|solved|handled?|processed|take care|come|look at|someone)\b`,
  String.raw`\bhow long (does|will) it take\b`, String.raw`\b(waiting|still waiting)\b.*\b(answer|response|reply)\b`,
  '(إيمتى|امتى|متى|قديش بياخد|قديش بتاخد|قديش لازم انطر|قديش وقت).*(جواب|الجواب|رد|الرد|يردّ?وا|بيردّ?وا|تنحل|بتنحل|ينحل|يصلّ?حوا|تتصلّ?ح|يجوا|يشوفوا)',
  String.raw`\b(emta|imta|ayya wa2t|2adesh|adesh)\b.*\b(jaweb|jawab|el jaweb|rad|el rad|yraddo|biraddo|tenhal|btenhal|yenhal|ysal7o|ysalle7o|ysalla7o|tetsalla7|yejo|yshoufo|byekhod|btekhod|bta5od)\b`,
  String.raw`\b(quand|combien de temps|dans combien|quel d[ée]lai|d[ée]lai)\b.*\b(r[ée]ponse|r[ée]pondre|r[ée]pondrez|r[ée]gl[ée]e?|r[ée]solue?|r[ée]par[ée]e?|trait[ée]e?|intervenir|intervention|venir|prendre)\b`,
].join('|'), 'i');
const DOCUMENT_WORDS_RE = /certificate|permit|document|licen[cs]e|record|إفادة|افادة|رخصة|مستند|اخراج قيد|إخراج قيد|ifade|ifadet|rukhsa|rukhset|wara2a|certificat|permis|extrait|licence/i;

// ---------------------------------------------------------------- intent handlers

const HANDLERS = {
  greeting: async (c) => ({
    messages: [c.t('greeting', { name: c.user ? ` ${c.user.name.split(' ')[0]}` : '' })],
    buttons: defaultButtons(c),
  }),
  thanks: async (c) => ({ messages: [c.t('thanks')], buttons: defaultButtons(c) }),
  goodbye: async (c) => ({ messages: [c.t('goodbye')] }),
  capabilities: async (c) => ({ messages: [c.t('capabilities')], buttons: defaultButtons(c) }),
  unknown: async (c) => ({ messages: [c.t('unknown')], buttons: defaultButtons(c) }),
  how_are_you: async (c) => ({ messages: [c.t('howAreYou')], buttons: defaultButtons(c) }),

  // how the handling works and how long it takes; for a citizen, also where their open complaints are
  response_time: async (c) => {
    const reply = { messages: [c.t('responseTime')], buttons: defaultButtons(c) };
    if (c.user?.role !== 'citizen') return reply;
    const rows = await query(
      `SELECT complaint_id, title, status, priority, category FROM complaints
        WHERE citizen_id = ? AND status NOT IN ('resolved','rejected') ORDER BY created_at DESC LIMIT 3`,
      [c.user.user_id]
    );
    if (!rows.length) return reply;
    return {
      messages: [c.t('responseTime'), c.t('responseTimeYours')],
      items: rows.map((r) => ({
        kind: 'complaint', id: r.complaint_id, title: r.title, status: r.status, priority: r.priority,
        category: r.category, to: `/complaints/${r.complaint_id}`,
      })),
      buttons: [c.btn('myComplaints', { to: '/complaints' })],
    };
  },
  bot_identity: async (c) => ({ messages: [c.t('identity', { name: MUNI.name[c.lang] })], buttons: defaultButtons(c) }),
  acknowledge: async (c) => ({ messages: [c.t('acknowledge')], buttons: defaultButtons(c) }),
  out_of_scope: async (c) => ({ messages: [c.t('outOfScope')], buttons: defaultButtons(c) }),

  how_to_report: async (c) => ({
    messages: [c.t('howToReport')],
    buttons: [c.user ? c.btn('report', { to: '/report' }) : c.btn('register', { to: '/register' })],
  }),

  complaint_status: async (c, nlu) => {
    if (!c.user) return { messages: [c.t('loginNeeded')], buttons: [c.btn('login', { to: '/login' })] };
    if (c.user.role !== 'citizen') return { messages: [c.t('staffOnlyCitizen')], buttons: staffButtons(c) };

    const id = nlu.entities?.id;
    const rows = await query(
      `SELECT c.complaint_id, c.title, c.status, c.priority, c.category, c.updated_at, d.category AS dept
         FROM complaints c LEFT JOIN departments d ON d.department_id = c.department_id
        WHERE c.citizen_id = ? ${id ? 'AND c.complaint_id = ?' : ''}
        ORDER BY c.created_at DESC LIMIT 3`,
      id ? [c.user.user_id, id] : [c.user.user_id]
    );
    const item = (r) => ({
      kind: 'complaint', id: r.complaint_id, title: r.title, status: r.status, priority: r.priority,
      category: r.category, to: `/complaints/${r.complaint_id}`,
    });
    if (id) {
      if (!rows[0]) return { messages: [c.t('complaintNotFound', { id })], buttons: [c.btn('myComplaints', { to: '/complaints' })] };
      const r = rows[0];
      return {
        messages: [c.t('complaintOne', {
          id: r.complaint_id, title: r.title, status: c.L('status', r.status),
          team: r.dept ? c.L('dept', r.dept) : '–', date: c.date(r.updated_at),
        })],
        items: [item(r)],
      };
    }
    if (!rows.length) return { messages: [c.t('noComplaints')], buttons: [c.btn('report', { to: '/report' })] };
    const [{ open }] = await query(
      "SELECT COUNT(*) AS open FROM complaints WHERE citizen_id = ? AND status NOT IN ('resolved','rejected')",
      [c.user.user_id]
    );
    return {
      messages: [c.t('yourComplaints', { open: Number(open) })],
      items: rows.map(item),
      buttons: [c.btn('myComplaints', { to: '/complaints' })],
    };
  },

  request_status: async (c, nlu) => {
    if (!c.user) return { messages: [c.t('loginNeeded')], buttons: [c.btn('login', { to: '/login' })] };
    if (c.user.role !== 'citizen') return { messages: [c.t('staffOnlyCitizen')], buttons: staffButtons(c) };
    const id = nlu.entities?.id;
    const rows = await query(
      `SELECT request_id, type, status FROM requests WHERE citizen_id = ? ${id ? 'AND request_id = ?' : ''}
        ORDER BY created_at DESC LIMIT 3`,
      id ? [c.user.user_id, id] : [c.user.user_id]
    );
    if (id && !rows[0]) return { messages: [c.t('requestNotFound', { id })], buttons: [c.btn('myRequests', { to: '/requests' })] };
    if (!rows.length) return { messages: [c.t('noRequests')], buttons: [c.btn('documents', { to: '/requests' })] };
    return {
      messages: [rows.length === 1 && id ? '' : c.t('yourRequests'),
        ...rows.map((r) => c.t('requestOne', { id: r.request_id, type: c.L('request_type', r.type), status: c.L('status', r.status) }))]
        .filter(Boolean),
      buttons: [c.btn('myRequests', { to: '/requests' })],
    };
  },

  document_info: async (c) => ({
    messages: [c.t('documentInfo', {
      list: REQUEST_TYPES.filter((x) => x !== 'other').map((x) => c.L('request_type', x)).join(c.lang === 'ar' ? '، ' : ', '),
    })],
    buttons: [c.user ? c.btn('documents', { to: '/requests' }) : c.btn('login', { to: '/login' })],
  }),

  points_info: async (c) => ({
    messages: [c.t('pointsInfo') + (c.user?.role === 'citizen' ? c.t('pointsYou', { points: c.user.points }) : '')],
  }),

  // one intent for all account questions; the wording decides which answer fits
  account_help: async (c, nlu, text) => {
    if (PASSWORD_RE.test(text)) {
      return {
        messages: [c.t('passwordHelp', { name: MUNI.name[c.lang], phone: MUNI.phone })],
        buttons: c.user ? [c.btn('profile', { to: '/profile' })] : [c.btn('forgot', { to: '/forgot-password' }), c.btn('login', { to: '/login' })],
      };
    }
    if (LOGIN_RE.test(text)) {
      if (c.user) return { messages: [c.t('loginAlready', { user: c.user.email })], buttons: defaultButtons(c) };
      return { messages: [c.t('loginHelp')], buttons: [c.btn('login', { to: '/login' }), c.btn('register', { to: '/register' })] };
    }
    return {
      messages: [c.t('accountHelp', { name: MUNI.name[c.lang], phone: MUNI.phone })],
      buttons: [c.user ? c.btn('profile', { to: '/profile' }) : c.btn('login', { to: '/login' })],
    };
  },

  human_contact: async (c) => ({
    messages: [c.t('contact', { name: MUNI.name[c.lang], phone: MUNI.phone, hours: MUNI.hours[c.lang], address: MUNI.address[c.lang] })],
    // external links: opened in a new tab (map) or by the phone app (tel:)
    buttons: [
      c.btn('map', { href: MUNI.map_url }),
      { label: c.btn('call').label.replace('{phone}', MUNI.phone), href: `tel:${MUNI.phone_intl}` },
    ],
  }),

  // The person is describing a problem: classify it now and offer to file it.
  report_problem: async (c, nlu, text) => {
    // Beirut only: refuse problems in a place outside the city
    const outside = outsidePlaceInText(text);
    if (outside) return { messages: [c.t('outsideBeirut', { place: outside })], buttons: defaultButtons(c) };

    const area = areaInText(text);
    const ai = await analyze({ description: text, area });
    const category = c.L('category', ai.classification.category);
    if (!c.user) {
      return { messages: [c.t('problemLogin', { category })], buttons: [c.btn('login', { to: '/login' }), c.btn('register', { to: '/register' })] };
    }
    if (c.user.role !== 'citizen') return { messages: [c.t('problemStaff', { category })], buttons: staffButtons(c) };
    const priority = c.L('priority', ai.prioritization.priority).toLowerCase();
    const confidence = Math.round((ai.classification.confidence ?? 0) * 100);
    const formLink = `/report?description=${encodeURIComponent(text.slice(0, 1500))}&title=${encodeURIComponent(titleFrom(text))}`
      + (area ? `&area=${encodeURIComponent(area)}` : '');
    return {
      messages: [c.t('problemDetected', { category, priority, confidence })
        + (area ? ` ${c.t('areaDetected', { area: c.L('area', area) })}` : '')],
      offer: {
        text,
        category: ai.classification.category,
        priority: ai.prioritization.priority,
        language: ai.classification.language,
      },
      buttons: [c.btn('submit', { action: 'submit_complaint', ...(area ? { area } : {}) }), c.btn('form', { to: formLink })],
    };
  },
};

// ---------------------------------------------------------------- route

router.post('/', chatLimiter, optionalAuthenticate, validate(schema), asyncHandler(async (req, res) => {
  const c = makeCtx(req);

  // -- confirmed action: file the complaint the assistant proposed
  if (req.body.action === 'submit_complaint') {
    if (!c.user) return res.json({ messages: [c.t('loginNeeded')], buttons: [c.btn('login', { to: '/login' })] });
    if (c.user.role !== 'citizen') return res.json({ messages: [c.t('staffOnlyCitizen')], buttons: staffButtons(c) });
    const text = req.body.text;
    if (text.length < 10) return res.json({ messages: [c.t('submitTooShort')] });
    const outside = outsidePlaceInText(text);
    if (outside) return res.json({ messages: [c.t('outsideBeirut', { place: outside })] });
    // the district is required (Beirut only): ask for it with one button per area
    if (!req.body.area) {
      return res.json({
        intent: 'ask_area',
        messages: [c.t('askArea')],
        offer: { text },
        buttons: AREAS.map((a) => ({ label: c.L('area', a), action: 'submit_complaint', area: a })),
      });
    }
    const { complaint } = await createComplaint(c.user, { title: titleFrom(text), description: text, area: req.body.area });
    return res.status(201).json({
      intent: 'submit_complaint',
      messages: [c.t('submitted', {
        id: complaint.complaint_id,
        category: c.L('category', complaint.category),
        priority: c.L('priority', complaint.priority).toLowerCase(),
        team: c.L('dept', complaint.category),
      })],
      items: [{
        kind: 'complaint', id: complaint.complaint_id, title: complaint.title, status: complaint.status,
        priority: complaint.priority, category: complaint.category, to: `/complaints/${complaint.complaint_id}`,
      }],
      complaint_id: complaint.complaint_id,
    });
  }

  // -- understand the message
  const text = req.body.message;
  if (RESPONSE_TIME_RE.test(text) && !DOCUMENT_WORDS_RE.test(text)) {
    return res.json({ intent: 'response_time', ...(await HANDLERS.response_time(c)) });
  }
  const nlu = await ml.intent(text);
  if (!nlu) return res.json({ intent: 'offline', messages: [c.t('offline')], buttons: defaultButtons(c) });

  // a message the model could not place that names a town outside Beirut is almost always a complaint
  // about that town: say clearly that only Beirut is served instead of "I did not understand"
  if (!HANDLERS[nlu.intent] || nlu.intent === 'unknown') {
    const outside = outsidePlaceInText(text);
    if (outside) return res.json({ intent: 'outside_beirut', messages: [c.t('outsideBeirut', { place: outside })], buttons: defaultButtons(c) });
  }
  const handler = HANDLERS[nlu.intent] || HANDLERS.unknown;
  const reply = await handler(c, nlu, text);
  res.json({
    intent: HANDLERS[nlu.intent] ? nlu.intent : 'unknown',
    confidence: nlu.confidence,
    detected_language: nlu.language,
    ...reply,
  });
}));

module.exports = router;
