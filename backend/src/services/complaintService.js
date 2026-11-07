/**
 * Creating a complaint: the AI pipeline from the proposal (section 3.5).
 *   1. NLP classification -> category + language
 *   2. historical context -> similar complaints in the same area (last 30 days)
 *   3. ML prioritization -> Critical / High / Medium / Low
 *   4. auto-route to the department for that category, notify citizen (+ staff if urgent)
 * Used by the complaint form (routes/complaints.js) and the chatbot (routes/chat.js).
 */
const { query, transaction } = require('../config/db');
const ml = require('./mlClient');
const { notify, notifyMany } = require('./notify');
const { levelInfo } = require('../utils/constants');

async function departmentForCategory(db, category) {
  const rows = await db.query('SELECT department_id FROM departments WHERE category = ?', [category]);
  return rows[0]?.department_id ?? null;
}

async function staffUserIds(db, departmentId) {
  const rows = await db.query(
    `SELECT u.user_id FROM users u
       LEFT JOIN employees e ON e.user_id = u.user_id
      WHERE u.is_active = 1 AND (u.role = 'admin' OR (u.role = 'employee' AND e.department_id = ?))`,
    [departmentId ?? -1]
  );
  return rows.map((r) => r.user_id);
}

/** Runs classification + prioritization without saving (used by the chatbot to preview). */
async function analyze({ title, description, area, hasEvidence = false }) {
  const text = title ? `${title}. ${description}` : description;
  const cls = await ml.classify(text);
  const [{ cnt }] = await query(
    `SELECT COUNT(*) AS cnt FROM complaints
      WHERE category = ? AND status <> 'rejected'
        AND created_at >= NOW() - INTERVAL 30 DAY
        AND (? IS NULL OR area = ?)`,
    [cls.category, area ?? null, area ?? null]
  );
  const pri = await ml.prioritize({
    text,
    category: cls.category,
    area: area ?? null,
    similar_recent_count: Number(cnt),
    has_evidence: hasEvidence,
  });
  return { classification: cls, prioritization: pri, similar_recent_count: Number(cnt) };
}

/**
 * @param user   the citizen (req.user)
 * @param data   { title, description, area?, address?, latitude?, longitude? }
 * @param files  multer files (already saved to disk)
 */
async function createComplaint(user, data, files = []) {
  const ai = await analyze({ ...data, hasEvidence: files.length > 0 });
  const cls = ai.classification;
  const pri = ai.prioritization;

  const complaint = await transaction(async (db) => {
    const departmentId = await departmentForCategory(db, cls.category);
    // Trusted reporters (enough points from resolved complaints) skip the "submitted" triage step
    const [me] = await db.query('SELECT points FROM users WHERE user_id = ?', [user.user_id]);
    const fastTrack = user.role === 'citizen' && levelInfo(me?.points ?? 0).fast_track;
    const r = await db.query(
      `INSERT INTO complaints
         (citizen_id, title, description, language, category, category_confidence, category_source,
          priority, priority_score, priority_source, area, address, latitude, longitude, department_id, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        user.user_id, data.title, data.description, cls.language, cls.category, cls.confidence, cls.source,
        pri.priority, pri.score, pri.source, data.area ?? null, data.address ?? null,
        data.latitude ?? null, data.longitude ?? null, departmentId, fastTrack ? 'under_review' : 'submitted',
      ]
    );
    const id = r.insertId;

    await db.query(
      "INSERT INTO complaint_status_history (complaint_id, status, note, changed_by) VALUES (?, 'submitted', NULL, ?)",
      [id, user.user_id]
    );
    if (fastTrack) {
      await db.query(
        "INSERT INTO complaint_status_history (complaint_id, status, note, changed_by) VALUES (?, 'under_review', '@trusted', ?)",
        [id, user.user_id]
      );
      await notify(db, user.user_id, 'complaint_fast_tracked', { id }, `/complaints/${id}`);
    }
    for (const f of files) {
      await db.query(
        `INSERT INTO complaint_attachments (complaint_id, file_name, original_name, mime_type, size_bytes)
         VALUES (?,?,?,?,?)`,
        [id, f.filename, f.originalname.slice(0, 255), f.mimetype, f.size]
      );
    }

    await notify(db, user.user_id, 'complaint_received', { id, category: cls.category }, `/complaints/${id}`);
    if (pri.priority === 'critical' || pri.priority === 'high') {
      const staff = await staffUserIds(db, departmentId);
      await notifyMany(db, staff, 'new_urgent_complaint', { id, priority: pri.priority, title: data.title }, `/complaints/${id}`);
    }

    const [row] = await db.query('SELECT * FROM complaints WHERE complaint_id = ?', [id]);
    return row;
  });

  return { complaint, ai };
}

module.exports = { analyze, createComplaint, departmentForCategory, staffUserIds };
