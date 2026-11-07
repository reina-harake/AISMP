/**
 * Analytics for the admin/employee dashboard ("Monitor Dashboard", "Generate Reports")
 * and the anonymized public transparency portal (section 3.7).
 * The ML "high-risk zone" predictions will plug in here in the AI phase;
 * for now hotspots are computed from historical frequency.
 */
const router = require('express').Router();
const { z } = require('zod');
const { query } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../utils/httpError');

const rangeSchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

function scope(user) {
  if (user?.role === 'employee') return { sql: 'department_id = ?', params: [user.department_id ?? -1] };
  return { sql: '1=1', params: [] };
}

async function buildStats(s, days) {
  const w = `${s.sql} AND created_at >= NOW() - INTERVAL ? DAY`;
  const p = [...s.params, days];

  const [totals] = await query(
    `SELECT COUNT(*) AS total,
            SUM(status = 'resolved') AS resolved,
            SUM(status = 'rejected') AS rejected,
            SUM(status NOT IN ('resolved','rejected')) AS open,
            SUM(priority = 'critical' AND status NOT IN ('resolved','rejected')) AS open_critical,
            ROUND(AVG(CASE WHEN resolved_at IS NOT NULL
                  THEN TIMESTAMPDIFF(MINUTE, created_at, resolved_at) END) / 60, 1) AS avg_resolution_hours
       FROM complaints WHERE ${w}`,
    p
  );
  const group = (col) =>
    query(`SELECT ${col} AS \`key\`, COUNT(*) AS count FROM complaints WHERE ${w} GROUP BY ${col} ORDER BY count DESC`, p);

  const [byStatus, byCategory, byPriority] = await Promise.all([group('status'), group('category'), group('priority')]);

  const daily = await query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS count FROM complaints WHERE ${w}
      GROUP BY DATE(created_at) ORDER BY day`,
    p
  );

  const numberify = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === null ? null : Number(v)]));
  return {
    days,
    totals: numberify(totals),
    by_status: byStatus.map(numberify2),
    by_category: byCategory.map(numberify2),
    by_priority: byPriority.map(numberify2),
    daily,
  };
}
const numberify2 = (r) => ({ key: r.key, count: Number(r.count) });

router.get(
  '/stats',
  authenticate,
  authorize('employee', 'admin'),
  validate(rangeSchema, 'query'),
  asyncHandler(async (req, res) => {
    const s = scope(req.user);
    const stats = await buildStats(s, req.query.days);

    // Recurring issues per area (feeds "Identify recurring issues" / "Predict high-risk zones")
    const hotspots = await query(
      `SELECT area, category, COUNT(*) AS count,
              SUM(priority IN ('critical','high')) AS high_or_critical
         FROM complaints
        WHERE ${s.sql} AND area IS NOT NULL AND created_at >= NOW() - INTERVAL ? DAY
        GROUP BY area, category HAVING count >= 2
        ORDER BY count DESC LIMIT 10`,
      [...s.params, req.query.days]
    );

    const departments = req.user.role === 'admin'
      ? await query(
        `SELECT d.department_id, d.name, d.category,
                SUM(c.status NOT IN ('resolved','rejected')) AS open,
                SUM(c.status = 'resolved') AS resolved
           FROM departments d LEFT JOIN complaints c ON c.department_id = d.department_id
          GROUP BY d.department_id ORDER BY open DESC`
      )
      : [];

    // How often staff had to correct the AI (useful metric for the report)
    const [ai] = await query(
      `SELECT SUM(category_source = 'ai') AS ai_category, SUM(category_source = 'manual') AS manual_category,
              SUM(category_source = 'fallback') AS fallback_category,
              SUM(priority_source = 'manual') AS manual_priority
         FROM complaints WHERE ${s.sql}`,
      s.params
    );

    res.json({
      ...stats,
      hotspots: hotspots.map((h) => ({ ...h, count: Number(h.count), high_or_critical: Number(h.high_or_critical) })),
      departments: departments.map((d) => ({ ...d, open: Number(d.open || 0), resolved: Number(d.resolved || 0) })),
      ai_overrides: Object.fromEntries(Object.entries(ai).map(([k, v]) => [k, Number(v || 0)])),
    });
  })
);

// Public transparency portal: aggregated, anonymized, no auth needed
router.get('/public', validate(rangeSchema, 'query'), asyncHandler(async (req, res) => {
  const stats = await buildStats({ sql: '1=1', params: [] }, req.query.days);
  const topReporters = await query(
    "SELECT points FROM users WHERE role = 'citizen' AND points > 0 ORDER BY points DESC LIMIT 5"
  );
  res.json({ ...stats, leaderboard_points: topReporters.map((r) => r.points) });
}));

module.exports = router;
