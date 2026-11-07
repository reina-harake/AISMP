const router = require('express').Router();
const fs = require('fs');
const { z } = require('zod');
const { query, transaction } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { evidenceUpload, uploadPath } = require('../middleware/upload');
const { asyncHandler, notFound, forbidden, badRequest } = require('../utils/httpError');
const {
  CATEGORIES, PRIORITIES, COMPLAINT_STATUSES, COMPLAINT_TRANSITIONS, POINTS, levelInfo, PRIORITY_RANK_SQL,
} = require('../utils/constants');
const { notify } = require('../services/notify');
const { createComplaint } = require('../services/complaintService');
const { AREAS, insideBeirut } = require('../config/beirut');

router.use(authenticate);

// ---------------------------------------------------------------- helpers

/** SQL fragment restricting which complaints the current user may see. */
function scopeFor(user) {
  if (user.role === 'admin') return { sql: '1=1', params: [] };
  if (user.role === 'employee') {
    return {
      sql: '(c.department_id = ? OR c.assigned_employee_id = ?)',
      params: [user.department_id ?? -1, user.employee_id ?? -1],
    };
  }
  return { sql: 'c.citizen_id = ?', params: [user.user_id] };
}

async function loadComplaintForUser(id, user) {
  const scope = scopeFor(user);
  const rows = await query(
    `SELECT c.* FROM complaints c WHERE c.complaint_id = ? AND ${scope.sql}`,
    [id, ...scope.params]
  );
  if (!rows[0]) throw notFound('Complaint');
  return rows[0];
}

function removeUploadedFiles(files = []) {
  for (const f of files) fs.unlink(f.path, () => {});
}

const idParam = z.object({ id: z.coerce.number().int().positive() });

// ---------------------------------------------------------------- create

// Beirut only: a district from the list is required; a map location is optional but must be inside Beirut.
const createSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(5000),
  area: z.enum(AREAS, { errorMap: () => ({ message: 'Choose the area of Beirut where the problem is' }) }),
  address: z.string().trim().max(255).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
})
  .refine((v) => (v.latitude == null) === (v.longitude == null), { message: 'Send both latitude and longitude', path: ['latitude'] })
  .refine((v) => v.latitude == null || v.longitude == null || insideBeirut(v.latitude, v.longitude), {
    message: 'This location is outside Beirut. Only problems inside Beirut can be reported.', path: ['latitude'],
  });

/**
 * POST /api/complaints  (citizen)  multipart/form-data, optional "evidence" files (max 5)
 * Runs the AI pipeline: classify -> historical context -> prioritize -> auto-route.
 */
router.post(
  '/',
  authorize('citizen'),
  evidenceUpload.array('evidence', 5),
  (req, res, next) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      removeUploadedFiles(req.files);
      const details = parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return next(badRequest('Validation failed', details));
    }
    req.body = parsed.data;
    next();
  },
  asyncHandler(async (req, res) => {
    const files = req.files || [];
    try {
      const result = await createComplaint(req.user, req.body, files);
      res.status(201).json(result);
    } catch (err) {
      removeUploadedFiles(files);
      throw err;
    }
  })
);

// ---------------------------------------------------------------- list

const listSchema = z.object({
  status: z.enum(COMPLAINT_STATUSES).optional(),
  category: z.enum(CATEGORIES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  area: z.string().trim().max(120).optional(),
  department_id: z.coerce.number().int().positive().optional(),
  assigned_to_me: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['priority', 'newest', 'oldest']).default('priority'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get('/', validate(listSchema, 'query'), asyncHandler(async (req, res) => {
  const f = req.query;
  const scope = scopeFor(req.user);
  const where = [scope.sql];
  const params = [...scope.params];

  if (f.status) { where.push('c.status = ?'); params.push(f.status); }
  if (f.category) { where.push('c.category = ?'); params.push(f.category); }
  if (f.priority) { where.push('c.priority = ?'); params.push(f.priority); }
  if (f.area) { where.push('c.area = ?'); params.push(f.area); }
  if (f.department_id) { where.push('c.department_id = ?'); params.push(f.department_id); }
  if (f.assigned_to_me === 'true' && req.user.employee_id) {
    where.push('c.assigned_employee_id = ?'); params.push(req.user.employee_id);
  }
  if (f.q) { where.push('(c.title LIKE ? OR c.description LIKE ?)'); params.push(`%${f.q}%`, `%${f.q}%`); }

  const order = {
    priority: `${PRIORITY_RANK_SQL}, c.created_at DESC`,
    newest: 'c.created_at DESC',
    oldest: 'c.created_at ASC',
  }[f.sort];

  const whereSql = where.join(' AND ');
  const offset = (f.page - 1) * f.limit;

  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM complaints c WHERE ${whereSql}`, params);
  const items = await query(
    `SELECT c.complaint_id, c.title, c.category, c.priority, c.status, c.area, c.language,
            c.category_source, c.priority_source, c.created_at, c.updated_at,
            d.name AS department_name, u.name AS citizen_name, eu.name AS assigned_employee_name
       FROM complaints c
       LEFT JOIN departments d ON d.department_id = c.department_id
       LEFT JOIN users u ON u.user_id = c.citizen_id
       LEFT JOIN employees e ON e.employee_id = c.assigned_employee_id
       LEFT JOIN users eu ON eu.user_id = e.user_id
      WHERE ${whereSql}
      ORDER BY ${order}
      LIMIT ? OFFSET ?`,
    [...params, f.limit, offset]
  );

  res.json({ items, page: f.page, limit: f.limit, total: Number(total) });
}));

// ---------------------------------------------------------------- detail

router.get('/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const c = await loadComplaintForUser(req.params.id, req.user);

  const [extra] = await query(
    `SELECT d.name AS department_name, d.category AS department_category,
            u.name AS citizen_name, eu.name AS assigned_employee_name
       FROM complaints c
       LEFT JOIN departments d ON d.department_id = c.department_id
       LEFT JOIN users u ON u.user_id = c.citizen_id
       LEFT JOIN employees e ON e.employee_id = c.assigned_employee_id
       LEFT JOIN users eu ON eu.user_id = e.user_id
      WHERE c.complaint_id = ?`,
    [c.complaint_id]
  );
  const history = await query(
    `SELECT h.status_id, h.status, h.note, h.created_at, u.name AS changed_by_name, u.role AS changed_by_role
       FROM complaint_status_history h LEFT JOIN users u ON u.user_id = h.changed_by
      WHERE h.complaint_id = ? ORDER BY h.created_at, h.status_id`,
    [c.complaint_id]
  );
  const attachments = await query(
    `SELECT attachment_id, original_name, mime_type, size_bytes, created_at
       FROM complaint_attachments WHERE complaint_id = ?`,
    [c.complaint_id]
  );

  res.json({ complaint: { ...c, ...extra }, history, attachments });
}));

// Attachments are served through the API (with access checks), never as public static files
router.get('/:id/attachments/:attId', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const attId = Number(req.params.attId);
  if (!Number.isInteger(id) || !Number.isInteger(attId)) throw badRequest('Invalid id');
  await loadComplaintForUser(id, req.user);
  const [att] = await query(
    'SELECT * FROM complaint_attachments WHERE attachment_id = ? AND complaint_id = ?',
    [attId, id]
  );
  if (!att) throw notFound('Attachment');
  res.type(att.mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(att.original_name)}"`);
  res.sendFile(uploadPath(att.file_name));
}));

// ---------------------------------------------------------------- status update

const statusSchema = z.object({
  status: z.enum(COMPLAINT_STATUSES),
  note: z.string().trim().max(500).optional(),
  // only with status 'rejected': the report was false or abusive -> the citizen loses points
  invalid: z.boolean().optional(),
});

/** PATCH /api/complaints/:id/status  (employee of the department, or admin) */
router.patch(
  '/:id/status',
  authorize('employee', 'admin'),
  validate(idParam, 'params'),
  validate(statusSchema),
  asyncHandler(async (req, res) => {
    const c = await loadComplaintForUser(req.params.id, req.user);
    const { status, note } = req.body;
    const invalid = status === 'rejected' && req.body.invalid === true;

    if (!COMPLAINT_TRANSITIONS[c.status].includes(status)) {
      throw badRequest(`Cannot move complaint from "${c.status}" to "${status}"`, {
        allowed: COMPLAINT_TRANSITIONS[c.status],
      });
    }
    // An employee moving an unassigned complaint to "assigned" takes it on themselves.
    // Admins must pick someone (PATCH /api/complaints/:id/assign).
    const selfAssign = status === 'assigned' && !c.assigned_employee_id && req.user.role === 'employee';
    if (status === 'assigned' && !c.assigned_employee_id && !selfAssign) {
      throw badRequest('Assign an employee first (PATCH /api/complaints/:id/assign)');
    }
    if (status === 'rejected' && !note) {
      throw badRequest('A note explaining the rejection is required');
    }

    const updated = await transaction(async (db) => {
      await db.query(
        `UPDATE complaints SET status = ?, resolved_at = IF(? = 'resolved', NOW(), resolved_at),
                assigned_employee_id = COALESCE(?, assigned_employee_id) WHERE complaint_id = ?`,
        [status, status, selfAssign ? req.user.employee_id : null, c.complaint_id]
      );
      await db.query(
        'INSERT INTO complaint_status_history (complaint_id, status, note, changed_by) VALUES (?,?,?,?)',
        [c.complaint_id, status,
          invalid ? `@invalid:${note}` : note ?? (selfAssign ? `@assigned:${req.user.name}` : null), req.user.user_id]
      );

      let points = 0;
      if (status === 'resolved') points = POINTS.complaint_resolved;
      if (invalid) points = POINTS.complaint_invalid;
      let before = null;
      if (points) {
        [before] = await db.query('SELECT points FROM users WHERE user_id = ? FOR UPDATE', [c.citizen_id]);
        await db.query('UPDATE users SET points = GREATEST(points + ?, 0) WHERE user_id = ?', [points, c.citizen_id]);
      }
      await notify(db, c.citizen_id, 'complaint_status', { id: c.complaint_id, status, note, points },
        `/complaints/${c.complaint_id}`);
      if (before && points > 0) {
        const was = levelInfo(before.points).level;
        const now = levelInfo(before.points + points);
        if (now.level !== was) {
          await notify(db, c.citizen_id, 'level_up', { level: now.level, fast_track: now.fast_track }, '/');
        }
      }

      const [row] = await db.query('SELECT * FROM complaints WHERE complaint_id = ?', [c.complaint_id]);
      return row;
    });

    res.json({ complaint: updated });
  })
);

// ---------------------------------------------------------------- assignment

const assignSchema = z
  .object({
    department_id: z.coerce.number().int().positive().optional(),
    employee_id: z.coerce.number().int().positive().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.department_id || v.employee_id, { message: 'department_id or employee_id is required' });

/** PATCH /api/complaints/:id/assign  (admin) - "Assign Complaints to Department" use case */
router.patch(
  '/:id/assign',
  authorize('admin'),
  validate(idParam, 'params'),
  validate(assignSchema),
  asyncHandler(async (req, res) => {
    const c = await loadComplaintForUser(req.params.id, req.user);
    if (['resolved', 'rejected'].includes(c.status)) throw badRequest(`Complaint is already ${c.status}`);

    let departmentId = req.body.department_id ?? c.department_id;
    let employee = null;

    if (req.body.employee_id) {
      const rows = await query(
        `SELECT e.employee_id, e.department_id, u.user_id, u.name FROM employees e
           JOIN users u ON u.user_id = e.user_id
          WHERE e.employee_id = ? AND u.is_active = 1`,
        [req.body.employee_id]
      );
      employee = rows[0];
      if (!employee) throw badRequest('Employee not found or inactive');
      if (req.body.department_id && req.body.department_id !== employee.department_id) {
        throw badRequest('Employee does not belong to that department');
      }
      departmentId = employee.department_id;
    } else {
      const d = await query('SELECT department_id FROM departments WHERE department_id = ?', [departmentId]);
      if (!d[0]) throw badRequest('Department not found');
    }

    const updated = await transaction(async (db) => {
      // Changing department without naming an employee clears a previous assignee
      const employeeId = employee ? employee.employee_id
        : departmentId !== c.department_id ? null : c.assigned_employee_id;

      // Moving straight to "assigned" when an employee is set and the complaint is still early in the flow
      const newStatus = employee && ['submitted', 'under_review'].includes(c.status) ? 'assigned' : c.status;

      await db.query(
        'UPDATE complaints SET department_id = ?, assigned_employee_id = ?, status = ? WHERE complaint_id = ?',
        [departmentId, employeeId, newStatus, c.complaint_id]
      );
      if (newStatus !== c.status || employee) {
        await db.query(
          'INSERT INTO complaint_status_history (complaint_id, status, note, changed_by) VALUES (?,?,?,?)',
          [c.complaint_id, newStatus, // system events are stored as codes (@assigned / @department) so the site can show them in any language
          req.body.note ?? (employee ? `@assigned:${employee.name}` : '@department'), req.user.user_id]
        );
      }
      if (employee) {
        await notify(db, employee.user_id, 'complaint_assigned_employee', { id: c.complaint_id }, `/complaints/${c.complaint_id}`);
      }
      if (newStatus !== c.status) {
        await notify(db, c.citizen_id, 'complaint_assigned_citizen', { id: c.complaint_id }, `/complaints/${c.complaint_id}`);
      }
      const [row] = await db.query('SELECT * FROM complaints WHERE complaint_id = ?', [c.complaint_id]);
      return row;
    });

    res.json({ complaint: updated });
  })
);

// ---------------------------------------------------------------- manual AI override

const overrideSchema = z
  .object({
    category: z.enum(CATEGORIES).optional(),
    priority: z.enum(PRIORITIES).optional(),
  })
  .refine((v) => v.category || v.priority, { message: 'category or priority is required' });

/**
 * PATCH /api/complaints/:id/classification  (employee, admin)
 * Staff correct the AI's category/priority. Marked source='manual' so these rows
 * become labelled training data when the models are retrained.
 */
router.patch(
  '/:id/classification',
  authorize('employee', 'admin'),
  validate(idParam, 'params'),
  validate(overrideSchema),
  asyncHandler(async (req, res) => {
    const c = await loadComplaintForUser(req.params.id, req.user);
    const sets = [];
    const params = [];
    const changes = [];

    if (req.body.category && req.body.category !== c.category) {
      sets.push("category = ?, category_source = 'manual'");
      params.push(req.body.category);
      changes.push(`category=${c.category}>${req.body.category}`);
      // re-route only if nobody is working on it yet
      if (!c.assigned_employee_id) {
        const rows = await query('SELECT department_id FROM departments WHERE category = ?', [req.body.category]);
        if (rows[0]) { sets.push('department_id = ?'); params.push(rows[0].department_id); }
      }
    }
    if (req.body.priority && req.body.priority !== c.priority) {
      sets.push("priority = ?, priority_source = 'manual'");
      params.push(req.body.priority);
      changes.push(`priority=${c.priority}>${req.body.priority}`);
    }
    if (!sets.length) return res.json({ complaint: c, message: 'No changes' });

    await transaction(async (db) => {
      await db.query(`UPDATE complaints SET ${sets.join(', ')} WHERE complaint_id = ?`, [...params, c.complaint_id]);
      await db.query(
        'INSERT INTO complaint_status_history (complaint_id, status, note, changed_by) VALUES (?,?,?,?)',
        [c.complaint_id, c.status, `@reclassified:${changes.join(',')}`, req.user.user_id]
      );
    });
    const [row] = await query('SELECT * FROM complaints WHERE complaint_id = ?', [c.complaint_id]);
    res.json({ complaint: row });
  })
);

module.exports = router;
