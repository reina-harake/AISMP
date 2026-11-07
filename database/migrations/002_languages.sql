-- Only needed for a database created BEFORE French support was added.
-- (Fresh installs get this from schema.sql.)  Run once:
--   docker compose exec -T db mysql -uaismp -paismp_pass aismp < database/migrations/002_languages.sql
ALTER TABLE users ADD COLUMN language ENUM('en','ar','fr') NOT NULL DEFAULT 'en' AFTER points;
ALTER TABLE complaints MODIFY language ENUM('en','fr','ar','arabizi','mixed','unknown') NOT NULL DEFAULT 'unknown';
