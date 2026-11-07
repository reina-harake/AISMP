/**
 * End-to-end API tests. Requires the stack running (DB seeded, API, ml-service).
 *   API_URL=http://localhost:5000 npm test
 */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');

const API = (process.env.API_URL || 'http://localhost:5000') + '/api';
const PW = 'Password123';
const tok = {};

async function call(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(API + path, { method, headers, body: payload });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

const login = async (email) => (await call('POST', '/auth/login', { body: { email, password: PW } })).body.token;

before(async () => {
  tok.admin = await login('admin@aismp.lb');
  tok.roads = await login('roads@aismp.lb');
  tok.elec = await login('electricity@aismp.lb');
  tok.nour = await login('nour@example.com');
  tok.rami = await login('rami@example.com');
  for (const [k, v] of Object.entries(tok)) assert.ok(v, `login failed for ${k}`);
});

// ------------------------------------------------------------------ auth
// registration is multipart: every field + a copy of the national ID
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
function regForm(fields, { withId = true } = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  if (withId) f.append('national_id', new Blob([PNG], { type: 'image/png' }), 'id.png');
  return f;
}
const person = (email, extra = {}) => ({
  first_name: 'Test', last_name: 'User', email, phone: '03 123 456', password: 'abc12345', password_confirm: 'abc12345', ...extra,
});

test('register validates input and creates a citizen', async () => {
  const bad = await call('POST', '/auth/register', { form: regForm({ first_name: 'X', email: 'nope', password: '123' }, { withId: false }) });
  assert.equal(bad.status, 400);
  const fields = bad.body.details.map((d) => d.field);
  for (const f of ['first_name', 'last_name', 'email', 'phone', 'password', 'national_id']) assert.ok(fields.includes(f), `${f} required`);

  const email = `test${Date.now()}@example.com`;
  const mismatch = await call('POST', '/auth/register', { form: regForm(person(email, { password_confirm: 'abc99999' })) });
  assert.equal(mismatch.status, 400);
  assert.ok(mismatch.body.details.some((d) => d.field === 'password_confirm'));
  const badPhone = await call('POST', '/auth/register', { form: regForm(person(email, { phone: '12' })) });
  assert.equal(badPhone.status, 400);
  const noId = await call('POST', '/auth/register', { form: regForm(person(email), { withId: false }) });
  assert.equal(noId.status, 400);

  const ok = await call('POST', '/auth/register', { form: regForm(person(email)) });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.user.role, 'citizen');
  assert.equal(ok.body.user.name, 'Test User');

  const dup = await call('POST', '/auth/register', { form: regForm(person(email)) });
  assert.equal(dup.status, 409);

  // only admins can open the ID copy
  const users = await call('GET', `/users?q=${encodeURIComponent(email)}`, { token: tok.admin });
  const id = users.body.items[0].user_id;
  assert.equal(users.body.items[0].has_national_id, 1);
  assert.equal((await call('GET', `/users/${id}/national-id`, { token: tok.admin })).status, 200);
  assert.equal((await call('GET', `/users/${id}/national-id`, { token: ok.body.token })).status, 403);
});

test('login rejects wrong password and bad tokens', async () => {
  const r = await call('POST', '/auth/login', { body: { email: 'admin@aismp.lb', password: 'wrong' } });
  assert.equal(r.status, 401);
  assert.equal((await call('GET', '/auth/me', { token: 'garbage' })).status, 401);
  assert.equal((await call('GET', '/complaints')).status, 401);
  const me = await call('GET', '/auth/me', { token: tok.roads });
  assert.equal(me.body.user.role, 'employee');
  assert.ok(me.body.user.department_id);
});

// ------------------------------------------------------------------ AI pipeline on submit
const created = {};

test('citizen submits complaints in English, Arabic and Arabizi; AI classifies + routes', async () => {
  const cases = [
    { key: 'en', title: 'Exposed wire near school', description: 'There is a fallen electricity wire sparking near the school gate, children pass here. Dangerous!', area: 'Ras Beirut', expect: 'electricity', lang: 'en' },
    { key: 'ar', title: 'تسرب مياه', description: 'في قسطل مكسور بالشارع والمياه عم تتسرب من يومين', area: 'Mousseitbeh', expect: 'water', lang: 'ar' },
    { key: 'arabizi', title: 'zbele kteer', description: 'el zbele sar elha iyem bel shere3 w el ri7a ktir 2awiye', area: 'Ras Beirut', expect: 'waste', lang: 'arabizi' },
    { key: 'noise', title: 'dajje', description: 'el jiran 3am y3emlo 7afle kel lele w el music ktiiir 3alye, ma fina nnem', area: 'Ras Beirut', expect: 'noise', lang: 'arabizi' },
    { key: 'lamp', title: 'Street lamp broken', description: 'The street lamp in front of our building has been broken for two weeks, it is very dark at night.', area: 'Mousseitbeh', expect: 'street_lighting', lang: 'en' },
  ];
  for (const c of cases) {
    const r = await call('POST', '/complaints', { token: tok.nour, body: { title: c.title, description: c.description, area: c.area } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.complaint.category, c.expect, `${c.key} category`);
    assert.equal(r.body.complaint.language, c.lang, `${c.key} language`);
    assert.ok(r.body.complaint.department_id, 'auto-routed to a department');
    assert.equal(r.body.complaint.status, 'submitted');
    created[c.key] = r.body.complaint;
  }
  // safety keywords + school should push the exposed wire to high/critical
  assert.ok(['critical', 'high'].includes(created.en.priority), `got ${created.en.priority}`);
});

test('complaint with evidence upload (multipart) and attachment download', async () => {
  const form = new FormData();
  form.append('title', 'Pothole');
  form.append('description', 'Huge pothole on the road in front of building 12');
  form.append('area', 'Ras Beirut');
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  form.append('evidence', new Blob([png], { type: 'image/png' }), 'photo.png');
  const r = await call('POST', '/complaints', { token: tok.nour, form });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.complaint.category, 'road_damage');
  created.road = r.body.complaint;

  const d = await call('GET', `/complaints/${created.road.complaint_id}`, { token: tok.nour });
  assert.equal(d.body.attachments.length, 1);
  const att = d.body.attachments[0];
  const file = await fetch(`${API}/complaints/${created.road.complaint_id}/attachments/${att.attachment_id}`, {
    headers: { Authorization: `Bearer ${tok.nour}` },
  });
  assert.equal(file.status, 200);
  // another citizen cannot download it
  const other = await fetch(`${API}/complaints/${created.road.complaint_id}/attachments/${att.attachment_id}`, {
    headers: { Authorization: `Bearer ${tok.rami}` },
  });
  assert.equal(other.status, 404);
});

test('rejects disallowed file types', async () => {
  const form = new FormData();
  form.append('title', 'Test');
  form.append('description', 'Some description text here');
  form.append('evidence', new Blob(['#!/bin/sh'], { type: 'application/x-sh' }), 'x.sh');
  const r = await call('POST', '/complaints', { token: tok.nour, form });
  assert.equal(r.status, 400);
});

// ------------------------------------------------------------------ access control
test('role-based visibility', async () => {
  const id = created.en.complaint_id;
  assert.equal((await call('GET', `/complaints/${id}`, { token: tok.rami })).status, 404, 'other citizen');
  assert.equal((await call('GET', `/complaints/${id}`, { token: tok.roads })).status, 404, 'other department');
  assert.equal((await call('GET', `/complaints/${id}`, { token: tok.elec })).status, 200, 'own department');
  assert.equal((await call('GET', `/complaints/${id}`, { token: tok.admin })).status, 200, 'admin');

  const list = await call('GET', '/complaints', { token: tok.nour });
  assert.ok(list.body.items.every((c) => c.citizen_name === 'Nour Citizen'));

  assert.equal((await call('POST', '/complaints', { token: tok.admin, body: { title: 'abc', description: 'abcdefghijk' } })).status, 403);
  assert.equal((await call('GET', '/users', { token: tok.roads })).status, 403);
  assert.equal((await call('PATCH', `/complaints/${id}/status`, { token: tok.nour, body: { status: 'resolved' } })).status, 403);
});

test('list filters, sorting and injection-safe search', async () => {
  const r = await call('GET', '/complaints?category=electricity&sort=priority&limit=5', { token: tok.admin });
  assert.equal(r.status, 200);
  assert.ok(r.body.items.every((c) => c.category === 'electricity'));
  const inj = await call('GET', `/complaints?q=${encodeURIComponent("' OR 1=1 --")}`, { token: tok.nour });
  assert.equal(inj.status, 200);
  assert.equal(inj.body.items.length, 0);
  assert.equal((await call('GET', '/complaints?priority=urgent', { token: tok.admin })).status, 400);
});

// ------------------------------------------------------------------ workflow
test('full workflow: review -> assign -> in progress -> resolved (+points, history, notifications)', async () => {
  const id = created.en.complaint_id;

  const skip = await call('PATCH', `/complaints/${id}/status`, { token: tok.elec, body: { status: 'resolved' } });
  assert.equal(skip.status, 400, 'cannot jump steps');

  assert.equal((await call('PATCH', `/complaints/${id}/status`, { token: tok.elec, body: { status: 'under_review' } })).status, 200);
  assert.equal((await call('PATCH', `/complaints/${id}/status`, { token: tok.admin, body: { status: 'assigned' } })).status, 400, 'admin must pick an employee');

  const emps = await call('GET', `/departments/${created.en.department_id}/employees`, { token: tok.admin });
  const employeeId = emps.body.items[0].employee_id;

  const wrongDept = await call('PATCH', `/complaints/${id}/assign`, { token: tok.admin, body: { employee_id: employeeId, department_id: 1 } });
  assert.equal(wrongDept.status, 400);

  const a = await call('PATCH', `/complaints/${id}/assign`, { token: tok.admin, body: { employee_id: employeeId } });
  assert.equal(a.status, 200);
  assert.equal(a.body.complaint.status, 'assigned');

  const mine = await call('GET', '/complaints?assigned_to_me=true', { token: tok.elec });
  assert.ok(mine.body.items.some((c) => c.complaint_id === id));

  assert.equal((await call('PATCH', `/complaints/${id}/status`, { token: tok.elec, body: { status: 'in_progress' } })).status, 200);

  const before = (await call('GET', '/auth/me', { token: tok.nour })).body.user.points;
  const done = await call('PATCH', `/complaints/${id}/status`, { token: tok.elec, body: { status: 'resolved', note: 'Wire repaired' } });
  assert.equal(done.status, 200);
  assert.ok(done.body.complaint.resolved_at);
  const after = (await call('GET', '/auth/me', { token: tok.nour })).body.user.points;
  assert.equal(after - before, 10);

  const detail = await call('GET', `/complaints/${id}`, { token: tok.nour });
  assert.deepEqual(detail.body.history.map((h) => h.status), ['submitted', 'under_review', 'assigned', 'in_progress', 'resolved']);

  const n = await call('GET', '/notifications', { token: tok.nour });
  assert.ok(n.body.unread > 0);
  assert.ok(n.body.items.some((x) => x.message.includes('earned 10 points')));
  assert.equal((await call('PATCH', '/notifications/read-all', { token: tok.nour })).status, 200);
  assert.equal((await call('GET', '/notifications', { token: tok.nour })).body.unread, 0);
});

test('Beirut only: area required from the list, map location must be inside Beirut', async () => {
  const base = { title: 'Pothole', description: 'Deep pothole in the middle of the road near the school.' };
  const noArea = await call('POST', '/complaints', { token: tok.nour, body: base });
  assert.equal(noArea.status, 400, 'area is required');
  const badArea = await call('POST', '/complaints', { token: tok.nour, body: { ...base, area: 'Jounieh' } });
  assert.equal(badArea.status, 400, 'area must be a Beirut district');
  const outside = await call('POST', '/complaints', {
    token: tok.nour, body: { ...base, area: 'Achrafieh', latitude: 33.9806, longitude: 35.6178 }, // Jounieh
  });
  assert.equal(outside.status, 400, 'location outside Beirut is refused');
  const inside = await call('POST', '/complaints', {
    token: tok.nour, body: { ...base, area: 'Ras Beirut', latitude: 33.8960, longitude: 35.4823 }, // Hamra
  });
  assert.equal(inside.status, 201, JSON.stringify(inside.body));
});

test('rejection requires a note', async () => {
  const id = created.arabizi.complaint_id;
  const waste = await login('waste@aismp.lb');
  assert.equal((await call('PATCH', `/complaints/${id}/status`, { token: waste, body: { status: 'rejected' } })).status, 400);
  const before = (await call('GET', '/auth/me', { token: tok.nour })).body.user.points;
  assert.equal((await call('PATCH', `/complaints/${id}/status`, { token: waste, body: { status: 'rejected', note: 'Duplicate of #8' } })).status, 200);
  const after = (await call('GET', '/auth/me', { token: tok.nour })).body.user.points;
  assert.equal(after, before, 'an ordinary rejection costs no points');
});

test('citizen has a level; a false/abusive report costs points (never below 0)', async () => {
  const me = (await call('GET', '/auth/me', { token: tok.nour })).body.user;
  assert.ok(['newcomer', 'active', 'trusted', 'guardian'].includes(me.level));
  assert.equal(typeof me.fast_track, 'boolean');

  const id = created.noise.complaint_id;
  const r = await call('PATCH', `/complaints/${id}/status`, {
    token: tok.admin, body: { status: 'rejected', note: 'Nothing found on site, repeated fake reports', invalid: true },
  });
  assert.equal(r.status, 200);
  const after = (await call('GET', '/auth/me', { token: tok.nour })).body.user.points;
  assert.equal(after, Math.max(me.points - 15, 0));
  const detail = await call('GET', `/complaints/${id}`, { token: tok.nour });
  assert.ok(detail.body.history.some((h) => h.note?.startsWith('@invalid:')));
});

test('staff can correct AI classification (feedback for retraining) and it re-routes', async () => {
  const id = created.ar.complaint_id;
  const r = await call('PATCH', `/complaints/${id}/classification`, { token: tok.admin, body: { category: 'road_damage', priority: 'critical' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.complaint.category_source, 'manual');
  assert.equal(r.body.complaint.priority_source, 'manual');
  assert.equal(r.body.complaint.department_id, 1);
});

// ------------------------------------------------------------------ requests
test('document request lifecycle', async () => {
  const c = await call('POST', '/requests', { token: tok.rami, body: { type: 'residence_certificate', details: 'Needed for bank' } });
  assert.equal(c.status, 201);
  const id = c.body.request.request_id;
  assert.equal((await call('GET', `/requests/${id}`, { token: tok.nour })).status, 404);
  assert.equal((await call('PATCH', `/requests/${id}/status`, { token: tok.roads, body: { status: 'ready' } })).status, 400);
  for (const s of ['under_review', 'approved', 'ready']) {
    const r = await call('PATCH', `/requests/${id}/status`, { token: tok.roads, body: { status: s } });
    assert.equal(r.status, 200, s);
  }
  const n = await call('GET', '/notifications', { token: tok.rami });
  assert.ok(n.body.items.some((x) => x.message.includes('ready for pickup')));
});

// ------------------------------------------------------------------ admin + dashboard
test('admin creates employee; dashboard and public stats', async () => {
  const email = `emp${Date.now()}@aismp.lb`;
  assert.equal((await call('POST', '/users', { token: tok.admin, body: { name: 'New Emp', email, password: 'abc12345', role: 'employee' } })).status, 400);
  const u = await call('POST', '/users', { token: tok.admin, body: { name: 'New Emp', email, password: 'abc12345', role: 'employee', department_id: 2 } });
  assert.equal(u.status, 201);
  assert.ok(u.body.user.employee_id);

  const dis = await call('PATCH', `/users/${u.body.user.user_id}`, { token: tok.admin, body: { is_active: false } });
  assert.equal(dis.status, 200);
  assert.equal((await call('POST', '/auth/login', { body: { email, password: 'abc12345' } })).status, 403);

  const s = await call('GET', '/dashboard/stats?days=30', { token: tok.admin });
  assert.equal(s.status, 200);
  assert.ok(s.body.totals.total >= 10);
  assert.ok(s.body.by_category.length >= 4);
  assert.ok(Array.isArray(s.body.hotspots));
  assert.ok(s.body.ai_overrides.manual_category >= 1);

  const es = await call('GET', '/dashboard/stats', { token: tok.roads });
  assert.ok(es.body.by_category.every((c) => c.key === 'road_damage'), 'employee sees only own department');

  const p = await call('GET', '/dashboard/public');
  assert.equal(p.status, 200);
  assert.ok(!JSON.stringify(p.body).includes('@'), 'public stats contain no emails');
});

// ------------------------------------------------------------------ languages (EN / AR / FR)
test('French complaint is classified and notifications follow each user\'s language', async () => {
  const email = `fr${Date.now()}@example.com`;
  const reg = await call('POST', '/auth/register', {
    form: regForm(person(email, { first_name: 'Claire', last_name: 'Test', language: 'fr' })),
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.user.language, 'fr');
  const fr = reg.body.token;

  const c = await call('POST', '/complaints', {
    token: fr,
    body: { title: 'Poubelles pleines', description: 'Les poubelles débordent devant mon immeuble depuis une semaine.', area: 'Achrafieh' },
  });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  assert.equal(c.body.complaint.language, 'fr');
  assert.equal(c.body.complaint.category, 'waste');

  const n = await call('GET', '/notifications', { token: fr });
  assert.ok(n.body.items[0].message.includes('a été reçue'), n.body.items[0].message);
  assert.ok(n.body.items[0].message.includes('déchets'));

  // switch to Arabic -> next notification arrives in Arabic
  const p = await call('PATCH', '/auth/me', { token: fr, body: { language: 'ar' } });
  assert.equal(p.status, 200);
  assert.equal(p.body.user.language, 'ar');
  const waste = await login('waste@aismp.lb');
  const s = await call('PATCH', `/complaints/${c.body.complaint.complaint_id}/status`, {
    token: waste, body: { status: 'under_review' },
  });
  assert.equal(s.status, 200);
  const n2 = await call('GET', '/notifications', { token: fr });
  assert.ok(n2.body.items[0].message.includes('قيد المراجعة'), n2.body.items[0].message);

  assert.equal((await call('PATCH', '/auth/me', { token: fr, body: { language: 'de' } })).status, 400);
});

test('an employee moving a complaint to "assigned" takes it on', async () => {
  const c = await call('POST', '/complaints', { token: tok.rami, body: { title: 'Water cut', description: 'No water in the building since yesterday morning' } });
  assert.equal(c.status, 201);
  const id = c.body.complaint.complaint_id;
  const water = await login('water@aismp.lb');
  assert.equal((await call('PATCH', `/complaints/${id}/status`, { token: water, body: { status: 'under_review' } })).status, 200);
  const r = await call('PATCH', `/complaints/${id}/status`, { token: water, body: { status: 'assigned' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.complaint.assigned_employee_id);
  const d = await call('GET', `/complaints/${id}`, { token: water });
  assert.equal(d.body.complaint.assigned_employee_name, 'Hadi Saab');
  assert.ok(d.body.history.some((h) => h.note === '@assigned:Hadi Saab'));
});

// ------------------------------------------------------------------ chatbot
test('chatbot: small talk, status lookup with privacy, problem -> offer -> submit', async () => {
  const hi = await call('POST', '/chat', { body: { message: 'marhaba', lang: 'ar' } });
  assert.equal(hi.status, 200);
  assert.equal(hi.body.intent, 'greeting');
  assert.ok(hi.body.messages[0].includes('مساعد البلدية'));

  // visitors are asked to log in for personal data
  const anon = await call('POST', '/chat', { body: { message: 'where is my complaint', lang: 'en' } });
  assert.equal(anon.body.intent, 'complaint_status');
  assert.ok(anon.body.buttons.some((b) => b.to === '/login'));

  // a citizen gets their own complaints, never someone else's
  const mine = await call('POST', '/chat', { token: tok.nour, body: { message: 'shu sar bi shakwete', lang: 'en' } });
  assert.equal(mine.body.intent, 'complaint_status');
  assert.ok(mine.body.items.length > 0);
  const otherId = created.road.complaint_id;          // belongs to Nour
  const spy = await call('POST', '/chat', { token: tok.rami, body: { message: `status of complaint #${otherId}`, lang: 'fr' } });
  assert.ok(spy.body.messages[0].includes(`n°${otherId}`) && spy.body.messages[0].includes('pas trouvé'), spy.body.messages[0]);

  // describing a problem -> classified offer, then confirmed submission
  const text = 'el kahraba ma2tou3a men 3 iyem bel 7ay w fi shrit 3al ard';
  const offer = await call('POST', '/chat', { token: tok.rami, body: { message: text, lang: 'en' } });
  assert.equal(offer.body.intent, 'report_problem');
  assert.equal(offer.body.offer.category, 'electricity');
  assert.ok(offer.body.buttons.some((b) => b.action === 'submit_complaint'));
  const sub = await call('POST', '/chat', { token: tok.rami, body: { action: 'submit_complaint', text, lang: 'en' } });
  assert.equal(sub.status, 201);
  const d = await call('GET', `/complaints/${sub.body.complaint_id}`, { token: tok.rami });
  assert.equal(d.body.complaint.category, 'electricity');
  assert.equal(d.body.complaint.language, 'arabizi');

  // staff and visitors cannot submit through the chat
  assert.equal((await call('POST', '/chat', { token: tok.admin, body: { action: 'submit_complaint', text } })).status, 200);
  const anonSubmit = await call('POST', '/chat', { body: { action: 'submit_complaint', text } });
  assert.ok(anonSubmit.body.buttons.some((b) => b.to === '/login'));

  // nonsense is not turned into a complaint
  const junk = await call('POST', '/chat', { body: { message: 'banana airplane', lang: 'en' } });
  assert.equal(junk.body.intent, 'unknown');
  assert.equal((await call('POST', '/chat', { body: { message: '' } })).status, 400);
});
