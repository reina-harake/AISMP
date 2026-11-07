const router = require('express').Router();
const { z } = require('zod');
const { query } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, notFound } = require('../utils/httpError');
const { CATEGORIES } = require('../utils/constants');

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const items = await query(
    `SELECT d.*, COUNT(e.employee_id) AS employee_count
       FROM departments d LEFT JOIN employees e ON e.department_id = d.department_id
      GROUP BY d.department_id ORDER BY d.name`
  );
  res.json({ items });
}));

// Employees of a department (used by admins when assigning complaints)
router.get('/:id/employees', authorize('admin', 'employee'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const d = await query('SELECT department_id FROM departments WHERE department_id = ?', [id]);
  if (!d[0]) throw notFound('Department');
  const items = await query(
    `SELECT e.employee_id, e.job_title, u.user_id, u.name, u.email,
            (SELECT COUNT(*) FROM complaints c
              WHERE c.assigned_employee_id = e.employee_id AND c.status IN ('assigned','in_progress')) AS open_workload
       FROM employees e JOIN users u ON u.user_id = e.user_id
      WHERE e.department_id = ? AND u.is_active = 1
      ORDER BY open_workload, u.name`,
    [id]
  );
  res.json({ items });
}));

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  name_ar: z.string().trim().max(100).optional(),
  category: z.enum(CATEGORIES).optional(),
});

router.post('/', authorize('admin'), validate(createSchema), asyncHandler(async (req, res) => {
  const r = await query('INSERT INTO departments (name, name_ar, category) VALUES (?,?,?)', [
    req.body.name, req.body.name_ar ?? null, req.body.category ?? null,
  ]);
  const [row] = await query('SELECT * FROM departments WHERE department_id = ?', [r.insertId]);
  res.status(201).json({ department: row });
}));

module.exports = router;
