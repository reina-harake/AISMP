-- Citizens now upload a copy of their national ID when they register (stored in the uploads folder;
-- only admins can open it). Existing accounts and staff accounts have none (NULL). Run once:
--   docker compose exec -T db mysql -uaismp -paismp_pass aismp < database/migrations/005_national_id.sql
ALTER TABLE users ADD COLUMN national_id_file VARCHAR(255) NULL AFTER phone;
