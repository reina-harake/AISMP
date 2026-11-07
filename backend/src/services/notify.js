/**
 * Creates in-app notifications ("Receive Notifications" use case).
 * The message is rendered in each recipient's own language (en / ar / fr).
 */
const { render } = require('./messages');

async function languagesOf(db, userIds) {
  if (!userIds.length) return {};
  const rows = await db.query('SELECT user_id, language FROM users WHERE user_id IN (?)', [userIds]);
  return Object.fromEntries(rows.map((r) => [r.user_id, r.language]));
}

/** notify(db, userId, 'complaint_status', { id, status, note }, '/complaints/12') */
async function notify(db, userId, key, params = {}, link = null) {
  return notifyMany(db, [userId], key, params, link);
}

async function notifyMany(db, userIds, key, params = {}, link = null) {
  const unique = [...new Set(userIds.filter(Boolean))];
  const langs = await languagesOf(db, unique);
  for (const id of unique) {
    const message = render(key, langs[id] || 'en', params).slice(0, 500);
    await db.query('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)', [id, message, link]);
  }
}

module.exports = { notify, notifyMany };
