/** Municipal document requests ("Request Municipal Document" / "Process Document Requests"). */
const router = require('express').Router();
const { z } = require('zod');
const { query, transaction } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, notFound, badRequest } = require('../utils/httpError');
const { REQUEST_TYPES, REQUEST_STATUSES, REQUEST_TRANSITIONS } = require('../utils/constants');
const { notify } = require('../services/notify');

router.use(authenticate);

const idParam = z.object({ id: z.coerce.number().int().positive() });

const createSchema = z.object({
  type: z.enum(REQUEST_TYPES),
  details: z.string().trim().max(3000).optional(),
});

router.post('/', authorize('citizen'), validate(createSchema), asyncHandler(async (req, res) => {
  const r = await transaction(async (db) => {
    const result = await db.query('INSERT INTO requests (citizen_id, type, details) VALUES (?,?,?)', [
      req.user.user_id, req.body.type, req.body.details ?? null,
    ]);
    await notify(db, req.user.user_id, 'request_received', { id: result.insertId, type: req.body.type },
      `/requests/${result.insertId}`);
    const [row] = await db.query('SELECT * FROM requests WHERE request_id = ?', [result.insertId]);
    return row;
  });
  res.status(201).json({ request: r });
}));

const listSchema = z.object({
  status: z.enum(REQUEST_STATUSES).optional(),
  type: z.enum(REQUEST_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get('/', validate(listSchema, 'query'), asyncHandler(async (req, res) => {
  const f = req.query;
  const where = [];
  const params = [];
  if (req.user.role === 'citizen') { where.push('r.citizen_id = ?'); params.push(req.user.user_id); }
  if (f.status) { where.push('r.status = ?'); params.push(f.status); }
  if (f.type) { where.push('r.type = ?'); params.push(f.type); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM requests r ${whereSql}`, params);
  const items = await query(
    `SELECT r.*, u.name AS citizen_name, hu.name AS handled_by_name
       FROM requests r
       JOIN users u ON u.user_id = r.citizen_id
       LEFT JOIN employees e ON e.employee_id = r.handled_by
       LEFT JOIN users hu ON hu.user_id = e.user_id
       ${whereSql}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, f.limit, (f.page - 1) * f.limit]
  );
  res.json({ items, page: f.page, limit: f.limit, total: Number(total) });
}));

async function loadRequest(id, user) {
  const rows = await query('SELECT * FROM requests WHERE request_id = ?', [id]);
  const r = rows[0];
  if (!r || (user.role === 'citizen' && r.citizen_id !== user.user_id)) throw notFound('Request');
  return r;
}

router.get('/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  res.json({ request: await loadRequest(req.params.id, req.user) });
}));

const statusSchema = z.object({
  status: z.enum(REQUEST_STATUSES),
  response_note: z.string().trim().max(500).optional(),
});

router.patch(
  '/:id/status',
  authorize('employee', 'admin'),
  validate(idParam, 'params'),
  validate(statusSchema),
  asyncHandler(async (req, res) => {
    const r = await loadRequest(req.params.id, req.user);
    const { status, response_note } = req.body;
    if (!REQUEST_TRANSITIONS[r.status].includes(status)) {
      throw badRequest(`Cannot move request from "${r.status}" to "${status}"`, { allowed: REQUEST_TRANSITIONS[r.status] });
    }
    if (status === 'rejected' && !response_note) throw badRequest('A note explaining the rejection is required');

    const updated = await transaction(async (db) => {
      await db.query(
        'UPDATE requests SET status = ?, response_note = COALESCE(?, response_note), handled_by = COALESCE(?, handled_by) WHERE request_id = ?',
        [status, response_note ?? null, req.user.employee_id ?? null, r.request_id]
      );
      await notify(db, r.citizen_id, 'request_status', { id: r.request_id, status, note: response_note },
        `/requests/${r.request_id}`);
      const [row] = await db.query('SELECT * FROM requests WHERE request_id = ?', [r.request_id]);
      return row;
    });
    res.json({ request: updated });
  })
);

module.exports = router;
