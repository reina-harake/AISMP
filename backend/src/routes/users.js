/** "Manage Users" use case (admin only). */
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { query, transaction } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, notFound, badRequest } = require('../utils/httpError');
const { ROLES } = require('../utils/constants');
const { uploadPath } = require('../middleware/upload');

router.use(authenticate, authorize('admin'));

const listSchema = z.object({
  role: z.enum(ROLES).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get('/', validate(listSchema, 'query'), asyncHandler(async (req, res) => {
  const f = req.query;
  const where = [];
  const params = [];
  if (f.role) { where.push('u.role = ?'); params.push(f.role); }
  if (f.q) { where.push('(u.name LIKE ? OR u.email LIKE ?)'); params.push(`%${f.q}%`, `%${f.q}%`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM users u ${whereSql}`, params);
  const items = await query(
    `SELECT u.user_id, u.name, u.email, u.phone, u.role, u.is_active, u.points, u.language, u.created_at,
            (u.national_id_file IS NOT NULL) AS has_national_id,
            e.employee_id, e.department_id, e.job_title, d.name AS department_name, d.category AS department_category
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.user_id
       LEFT JOIN departments d ON d.department_id = e.department_id
       ${whereSql} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    [...params, f.limit, (f.page - 1) * f.limit]
  );
  res.json({ items, page: f.page, limit: f.limit, total: Number(total) });
}));

/** GET /api/users/:id/national-id  (admin) - the ID copy a citizen uploaded when registering, for verification */
router.get('/:id/national-id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw badRequest('Invalid id');
  const [u] = await query('SELECT national_id_file FROM users WHERE user_id = ?', [id]);
  if (!u?.national_id_file) throw notFound('National ID copy');
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(uploadPath(u.national_id_file));
}));

const createSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(190),
    phone: z.string().trim().max(30).optional(),
    password: z.string().min(8).max(100),
    role: z.enum(['employee', 'admin']),
    language: z.enum(['en', 'ar', 'fr']).default('en'),
    department_id: z.coerce.number().int().positive().optional(),
    job_title: z.string().trim().max(100).optional(),
  })
  .refine((v) => v.role !== 'employee' || v.department_id, {
    message: 'department_id is required for employees', path: ['department_id'],
  });

router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  if (b.department_id) {
    const d = await query('SELECT 1 FROM departments WHERE department_id = ?', [b.department_id]);
    if (!d[0]) throw badRequest('Department not found');
  }
  const hash = await bcrypt.hash(b.password, 12);
  const userId = await transaction(async (db) => {
    const r = await db.query('INSERT INTO users (name, email, phone, password_hash, role, language) VALUES (?,?,?,?,?,?)', [
      b.name, b.email, b.phone ?? null, hash, b.role, b.language,
    ]);
    if (b.role === 'employee') {
      await db.query('INSERT INTO employees (user_id, department_id, job_title) VALUES (?,?,?)', [
        r.insertId, b.department_id, b.job_title ?? null,
      ]);
    }
    return r.insertId;
  });
  const [user] = await query(
    `SELECT u.user_id, u.name, u.email, u.role, e.employee_id, e.department_id
       FROM users u LEFT JOIN employees e ON e.user_id = u.user_id WHERE u.user_id = ?`,
    [userId]
  );
  res.status(201).json({ user });
}));

const updateSchema = z.object({
  is_active: z.boolean().optional(),
  department_id: z.coerce.number().int().positive().optional(),
  job_title: z.string().trim().max(100).optional(),
});

router.patch('/:id', validate(updateSchema), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const [u] = await query(
    'SELECT u.*, e.employee_id FROM users u LEFT JOIN employees e ON e.user_id = u.user_id WHERE u.user_id = ?',
    [id]
  );
  if (!u) throw notFound('User');
  if (id === req.user.user_id && req.body.is_active === false) throw badRequest('You cannot disable your own account');

  if (req.body.is_active !== undefined) {
    await query('UPDATE users SET is_active = ? WHERE user_id = ?', [req.body.is_active ? 1 : 0, id]);
  }
  if ((req.body.department_id || req.body.job_title !== undefined) && u.employee_id) {
    await query(
      'UPDATE employees SET department_id = COALESCE(?, department_id), job_title = COALESCE(?, job_title) WHERE employee_id = ?',
      [req.body.department_id ?? null, req.body.job_title ?? null, u.employee_id]
    );
  }
  const [row] = await query(
    `SELECT u.user_id, u.name, u.email, u.role, u.is_active, e.employee_id, e.department_id, e.job_title
       FROM users u LEFT JOIN employees e ON e.user_id = u.user_id WHERE u.user_id = ?`,
    [id]
  );
  res.json({ user: row });
}));

module.exports = router;
