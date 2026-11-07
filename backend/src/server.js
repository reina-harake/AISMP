const app = require('./app');
const env = require('./config/env');
const { waitForDb } = require('./config/db');

(async () => {
  await waitForDb();
  app.listen(env.port, () => console.log(`[aismp] API listening on http://localhost:${env.port}`));
})().catch((err) => {
  console.error('[aismp] failed to start:', err);
  process.exit(1);
});
