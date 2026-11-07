const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { query } = require('../config/db');
const { HttpError } = require('../utils/httpError');

function signToken(user) {
  return jwt.sign({ sub: user.user_id, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

/**
 * Verifies the Bearer JWT and loads the current user (and employee record if any).
 * The DB lookup means deactivated users / role changes take effect immediately.
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Authentication required');

    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch {
      throw new HttpError(401, 'Invalid or expired token');
    }

    const rows = await query(
      `SELECT u.user_id, u.name, u.email, u.phone, u.role, u.is_active, u.points, u.language,
              e.employee_id, e.department_id
         FROM users u
         LEFT JOIN employees e ON e.user_id = u.user_id
        WHERE u.user_id = ?`,
      [payload.sub]
    );
    const user = rows[0];
    if (!user || !user.is_active) throw new HttpError(401, 'Account not found or disabled');

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Like authenticate, but lets anonymous visitors through (req.user stays undefined). */
async function optionalAuthenticate(req, res, next) {
  if (!req.headers.authorization) return next();
  authenticate(req, res, (err) => {
    if (err) req.user = undefined;   // bad/expired token: treat as anonymous
    next();
  });
}

/** Role-based access control: authorize('admin'), authorize('employee','admin') ... */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Authentication required'));
  if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Insufficient role'));
  next();
};

module.exports = { signToken, authenticate, optionalAuthenticate, authorize };
