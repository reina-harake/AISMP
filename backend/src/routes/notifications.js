const router = require('express').Router();
const { query } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, notFound } = require('../utils/httpError');

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const unreadOnly = req.query.unread === 'true';
  const items = await query(
    `SELECT * FROM notifications WHERE user_id = ? ${unreadOnly ? 'AND is_read = 0' : ''}
      ORDER BY created_at DESC, notification_id DESC LIMIT 50`,
    [req.user.user_id]
  );
  const [{ unread }] = await query(
    'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0',
    [req.user.user_id]
  );
  res.json({ items, unread: Number(unread) });
}));

router.patch('/read-all', asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.user_id]);
  res.json({ message: 'All notifications marked as read' });
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  const r = await query('UPDATE notifications SET is_read = 1 WHERE notification_id = ? AND user_id = ?', [
    Number(req.params.id), req.user.user_id,
  ]);
  if (!r.affectedRows) throw notFound('Notification');
  res.json({ message: 'Marked as read' });
}));

module.exports = router;
