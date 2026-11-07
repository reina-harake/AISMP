/**
 * Seeds demo accounts and sample complaints. Safe to run repeatedly (skips existing rows).
 * Demo password for every account: Password123
 */
const bcrypt = require('bcryptjs');
const { query, pool, waitForDb } = require('../src/config/db');

const PASSWORD = 'Password123';

const STAFF = [
  { name: 'Admin User', email: 'admin@aismp.lb', role: 'admin' },
  { name: 'Karim Haddad', email: 'roads@aismp.lb', role: 'employee', category: 'road_damage', job_title: 'Road Engineer' },
  { name: 'Maya Khoury', email: 'electricity@aismp.lb', role: 'employee', category: 'electricity', job_title: 'Electrician' },
  { name: 'Hadi Saab', email: 'water@aismp.lb', role: 'employee', category: 'water', job_title: 'Water Technician' },
  { name: 'Lina Fares', email: 'waste@aismp.lb', role: 'employee', category: 'waste', job_title: 'Sanitation Officer' },
  { name: 'Omar Nasser', email: 'services@aismp.lb', role: 'employee', category: 'other', job_title: 'Clerk' },
  { name: 'Sami Aoun', email: 'police@aismp.lb', role: 'employee', category: 'noise', job_title: 'Municipal Police Officer' },
];

const CITIZENS = [
  { name: 'Nour Citizen', email: 'nour@example.com', language: 'en' },
  { name: 'Rami Citizen', email: 'rami@example.com', language: 'en' },
  { name: 'Layla Citizen', email: 'layla@example.com', language: 'ar' },
  { name: 'Claire Citizen', email: 'claire@example.com', language: 'fr' },
];

// Sample complaints in English, French, Arabic and Arabizi
const COMPLAINTS = [
  ['Big pothole on main road', 'There is a deep pothole near the school entrance, cars are swerving to avoid it.', 'en', 'road_damage', 'high', 'Ras Beirut'],
  ['حفرة كبيرة في الطريق', 'في حفرة كبيرة قدام الجامع وعم تعمل حوادث للسيارات', 'ar', 'road_damage', 'high', 'Ras Beirut'],
  ['Street lights off', 'All street lights on our street have been off for a week, very dark at night.', 'en', 'street_lighting', 'medium', 'Achrafieh'],
  ['el kahraba maktou3a', 'el kahraba maktou3a men 3 iyem bel 7ay w fi shrit ma2tou3 3al ard', 'arabizi', 'electricity', 'critical', 'Achrafieh'],
  ['Water leak', 'A pipe burst on the sidewalk and water has been flowing for two days.', 'en', 'water', 'high', 'Mousseitbeh'],
  ['ما في مي', 'ما في مياه بالبناية من يومين', 'ar', 'water', 'medium', 'Mousseitbeh'],
  ['Garbage not collected', 'Garbage bins overflowing for 5 days, smells terrible and attracting rats.', 'en', 'waste', 'medium', 'Ras Beirut'],
  ['zbele bel shere3', 'el zbele mkaddase bel shere3 w ri7a ktir 2awiye', 'arabizi', 'waste', 'medium', 'Ras Beirut'],
  ['Noise from construction at night', 'Construction site works after midnight every day.', 'en', 'noise', 'low', 'Mousseitbeh'],
  ['Fuite d’eau dans la rue', 'Une conduite a éclaté devant l’immeuble, l’eau coule depuis hier.', 'fr', 'water', 'high', 'Achrafieh'],
  ['Lampadaires éteints', 'Les lampadaires de notre rue sont éteints depuis une semaine.', 'fr', 'street_lighting', 'medium', 'Achrafieh'],
  ['Nid-de-poule dangereux', 'Un énorme nid-de-poule près de l’école, les voitures font des écarts.', 'fr', 'road_damage', 'high', 'Mousseitbeh'],
  ['dajje kel lele', 'el jiran fo2na 3am y3emlo 7aflet kel lele lal sob7, ma 3am nnem', 'arabizi', 'noise', 'low', 'Ras Beirut'],
  ['bina bala rokhsa', 'jarna 3am yzid tabe2 bala permis w 3am yeshteghlo bel leil', 'arabizi', 'illegal_construction', 'medium', 'Mousseitbeh'],
  ['Stray dogs near school', 'A pack of stray dogs waits by the school gate every morning and chases the kids.', 'en', 'stray_animals', 'high', 'Achrafieh'],
  ['سيارة صافة عالرصيف', 'في سيارة صافة عالرصيف قدام البناية من أسبوع والناس عم تمشي بالطريق', 'ar', 'parking', 'low', 'Ras Beirut'],
];

async function upsertUser(u, hash) {
  const existing = await query('SELECT user_id FROM users WHERE email = ?', [u.email]);
  if (existing[0]) return existing[0].user_id;
  const r = await query('INSERT INTO users (name, email, password_hash, role, language) VALUES (?,?,?,?,?)', [
    u.name, u.email, hash, u.role || 'citizen', u.language || 'en',
  ]);
  return r.insertId;
}

(async () => {
  await waitForDb();
  const hash = await bcrypt.hash(PASSWORD, 12);

  for (const s of STAFF) {
    const userId = await upsertUser(s, hash);
    if (s.role === 'employee') {
      const [dept] = await query('SELECT department_id FROM departments WHERE category = ?', [s.category]);
      if (!dept) {
        throw new Error(`No department for category "${s.category}". This database was created with an older schema: `
          + 'run the files in database/migrations/ (see README), e.g. 003_more_categories.sql.');
      }
      await query('INSERT IGNORE INTO employees (user_id, department_id, job_title) VALUES (?,?,?)', [
        userId, dept.department_id, s.job_title,
      ]);
    }
  }

  const citizenIds = [];
  for (const c of CITIZENS) citizenIds.push(await upsertUser(c, hash));

  const [{ n }] = await query('SELECT COUNT(*) AS n FROM complaints');
  if (Number(n) === 0) {
    for (const [i, [title, desc, lang, cat, pri, area]] of COMPLAINTS.entries()) {
      const [dept] = await query('SELECT department_id FROM departments WHERE category = ?', [cat]);
      const citizen = citizenIds[i % citizenIds.length];
      const r = await query(
        `INSERT INTO complaints (citizen_id, title, description, language, category, category_confidence,
            category_source, priority, priority_source, area, department_id, created_at)
         VALUES (?,?,?,?,?,0.9,'ai',?,'ai',?,?, NOW() - INTERVAL ? DAY)`,
        [citizen, title, desc, lang, cat, pri, area, dept.department_id, COMPLAINTS.length - i]
      );
      await query(
        "INSERT INTO complaint_status_history (complaint_id, status, note, changed_by, created_at) VALUES (?, 'submitted', NULL, ?, NOW() - INTERVAL ? DAY)",
        [r.insertId, citizen, COMPLAINTS.length - i]
      );
    }
    console.log(`[seed] inserted ${COMPLAINTS.length} sample complaints`);
  }

  console.log(`[seed] done. Demo accounts (password: ${PASSWORD}):`);
  console.log('  admin@aismp.lb | roads@ / electricity@ / water@ / waste@ / services@ / police@aismp.lb');
  console.log('  citizens: nour@ & rami@example.com (EN), layla@example.com (AR), claire@example.com (FR)');
  await pool.end();
})().catch(async (err) => {
  console.error('[seed] failed:', err);
  await pool.end();
  process.exit(1);
});
