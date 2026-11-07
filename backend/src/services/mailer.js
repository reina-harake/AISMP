/**
 * Sends email (used for password reset links).
 * Configure SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / MAIL_FROM to send real email.
 * Without SMTP_HOST, nothing is sent: the message is printed to the backend log instead
 * (`docker compose logs backend`), which is enough for local development and demos.
 */
const nodemailer = require('nodemailer');
const env = require('../config/env');

let transport = null;
if (env.smtp.host) {
  transport = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
}

const isConfigured = () => Boolean(transport);

async function sendMail({ to, subject, text }) {
  if (!transport) {
    console.log(`[mail] SMTP not configured, email not sent.\n  To: ${to}\n  Subject: ${subject}\n  ${text.replace(/\n/g, '\n  ')}`);
    return false;
  }
  await transport.sendMail({ from: env.smtp.from, to, subject, text });
  return true;
}

module.exports = { sendMail, isConfigured };
