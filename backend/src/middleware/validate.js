const { badRequest } = require('../utils/httpError');

/**
 * Input validation with zod. Replaces req[source] with the parsed (trimmed, coerced) data,
 * so handlers only ever see clean input.
 */
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(badRequest('Validation failed', details));
  }
  if (source === 'query') {
    // req.query is a getter in Express 5-style setups; assign safely
    Object.defineProperty(req, 'query', { value: result.data, writable: true });
  } else {
    req[source] = result.data;
  }
  next();
};

module.exports = { validate };
