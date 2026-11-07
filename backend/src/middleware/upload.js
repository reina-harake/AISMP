const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');
const { badRequest } = require('../utils/httpError');

fs.mkdirSync(env.uploadDir, { recursive: true });

const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const storage = multer.diskStorage({
  destination: env.uploadDir,
  // random file names: never trust the user's file name on disk
  filename: (req, file, cb) => cb(null, crypto.randomUUID() + ALLOWED[file.mimetype]),
});

const evidenceUpload = multer({
  storage,
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED[file.mimetype]) return cb(badRequest('Only JPG, PNG, WEBP or PDF files are allowed'));
    cb(null, true);
  },
});

// copy of the national ID card, required when a citizen registers (one file)
const idUpload = multer({
  storage,
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED[file.mimetype]) return cb(badRequest('The ID copy must be a JPG, PNG, WEBP image or a PDF'));
    cb(null, true);
  },
});

module.exports = { evidenceUpload, idUpload, uploadPath: (name) => path.join(env.uploadDir, name) };
