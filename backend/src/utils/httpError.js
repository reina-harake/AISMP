class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
const forbidden = (msg = 'You do not have permission to do this') => new HttpError(403, msg);
const badRequest = (msg, details) => new HttpError(400, msg, details);

/** Wrap async route handlers so thrown errors reach the error middleware. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { HttpError, notFound, forbidden, badRequest, asyncHandler };
