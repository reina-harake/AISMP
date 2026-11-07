const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const { query } = require('../config/db');
const { signToken, authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const fs = require('fs');
const { asyncHandler, HttpError, badRequest } = require('../utils/httpError');
const { idUpload } = require('../middleware/upload');
const { levelInfo } = require('../utils/constants');

// Brute-force protection on login/register: only FAILED attempts count,
// so normal use (or a live demo with many logins) is never blocked.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

// letters (any script, so Arabic names work), spaces, hyphens and apostrophes
const personName = (what) => z.string().trim()
  .min(2, `${what} must be at least 2 letters`).max(60)
  .regex(/^\p{L}[\p{L}\p{M}' -]*$/u, `${what} can only contain letters, spaces, hyphens and apostrophes`);

/** Lebanese number: 03 123 456, 71 123 456, 01 123 456, +961 3 123 456, 00961 ... */
function isLebanesePhone(v) {
  const d = v.replace(/[\s().-]/g, '').replace(/^(\+961|00961|961)/, '').replace(/^0/, '');
  return /^[1-9]\d{6,7}$/.test(d);
}

// Citizens register with first + last name, email, phone, a copy of their national ID (file), and the
// password typed twice. Every field is required. Sent as multipart/form-data because of the file.
const registerSchema = z.object({
  first_name: personName('First name'),
  last_name: personName('Last name'),
  email: z.string().trim().toLowerCase().email().max(190),
  phone: z.string().trim().max(30).refine(isLebanesePhone, 'Enter a valid Lebanese phone number, for example 03 123 456'),
  language: z.enum(['en', 'ar', 'fr']).default('en'),
  password,
  password_confirm: z.string(),
}).refine((v) => v.password === v.password_confirm, { message: 'The two passwords do not match', path: ['password_confirm'] });

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

function publicUser(u) {
  return {
    user_id: u.user_id, name: u.name, email: u.email, phone: u.phone ?? null, role: u.role,
    points: u.points ?? 0, ...(u.role === 'citizen' ? levelInfo(u.points ?? 0) : {}), language: u.language || 'en',
    employee_id: u.employee_id ?? null, department_id: u.department_id ?? null,
  };
}

// Citizens self-register. Employees/admins are created by an admin (routes/users.js).
const removeFile = (f) => f && fs.unlink(f.path, () => {});

router.post(
  '/register',
  authLimiter,
  idUpload.single('national_id'),
  (req, res, next) => {
    const parsed = registerSchema.safeParse(req.body);
    const details = parsed.success ? [] : parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    if (!req.file) details.push({ field: 'national_id', message: 'Upload a copy of your national ID (photo or PDF)' });
    if (details.length) {
      removeFile(req.file);
      return next(badRequest('Validation failed', details));
    }
    req.body = parsed.data;
    next();
  },
  asyncHandler(async (req, res) => {
    const { first_name: first, last_name: last, email, phone, language, password: pw } = req.body;
    const name = `${first} ${last}`;
    try {
      const hash = await bcrypt.hash(pw, 12);
      const result = await query(
        `INSERT INTO users (name, email, phone, national_id_file, password_hash, role, language)
         VALUES (?, ?, ?, ?, ?, 'citizen', ?)`,
        [name, email, phone, req.file.filename, hash, language]
      );
      const user = { user_id: result.insertId, name, email, phone, role: 'citizen', points: 0, language };
      res.status(201).json({ token: signToken(user), user: publicUser(user) });
    } catch (err) {
      removeFile(req.file);       // e.g. email already registered (409): don't keep the ID copy
      throw err;
    }
  })
);

router.post('/login', authLimiter, validate(loginSchema), asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT u.*, e.employee_id, e.department_id
       FROM users u LEFT JOIN employees e ON e.user_id = u.user_id
      WHERE u.email = ?`,
    [req.body.email]
  );
  const user = rows[0];
  // Same message for unknown email and wrong password (don't leak which emails exist)
  const ok = user && (await bcrypt.compare(req.body.password, user.password_hash));
  if (!ok) throw new HttpError(401, 'Invalid email or password');
  if (!user.is_active) throw new HttpError(403, 'Account is disabled');
  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.get('/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().max(30).optional(),
    language: z.enum(['en', 'ar', 'fr']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

// Update own profile (name, phone, preferred language for the site and notifications)
router.patch('/me', authenticate, validate(profileSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  await query(
    'UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), language = COALESCE(?, language) WHERE user_id = ?',
    [b.name ?? null, b.phone ?? null, b.language ?? null, req.user.user_id]
  );
  const [u] = await query(
    `SELECT u.*, e.employee_id, e.department_id FROM users u
       LEFT JOIN employees e ON e.user_id = u.user_id WHERE u.user_id = ?`,
    [req.user.user_id]
  );
  res.json({ user: publicUser(u) });
}));

const changePwSchema = z.object({ current_password: z.string().min(1), new_password: password });

router.post('/change-password', authenticate, validate(changePwSchema), asyncHandler(async (req, res) => {
  const [row] = await query('SELECT password_hash FROM users WHERE user_id = ?', [req.user.user_id]);
  if (!(await bcrypt.compare(req.body.current_password, row.password_hash))) {
    throw new HttpError(400, 'Current password is incorrect');
  }
  await query('UPDATE users SET password_hash = ? WHERE user_id = ?', [
    await bcrypt.hash(req.body.new_password, 12), req.user.user_id,
  ]);
  res.json({ message: 'Password updated' });
}));

module.exports = router;
