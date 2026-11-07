-- Adds the complaint categories street_lighting, noise, illegal_construction, parking,
-- stray_animals and public_spaces, with one department each (auto-routing).
-- Only needed for a database created BEFORE these categories were added
-- (fresh installs get this from schema.sql). Run once:
--   docker compose exec -T db mysql -uaismp -paismp_pass aismp < database/migrations/003_more_categories.sql
SET NAMES utf8mb4;

ALTER TABLE departments MODIFY category
  ENUM('road_damage','street_lighting','electricity','water','waste','noise','illegal_construction','parking','stray_animals','public_spaces','other') NULL;
ALTER TABLE complaints MODIFY category
  ENUM('road_damage','street_lighting','electricity','water','waste','noise','illegal_construction','parking','stray_animals','public_spaces','other') NOT NULL DEFAULT 'other';

INSERT IGNORE INTO departments (name, name_ar, category) VALUES
  ('Street Lighting', 'الإنارة العامة', 'street_lighting'),
  ('Municipal Police – Noise', 'الشرطة البلدية – الضجيج', 'noise'),
  ('Engineering & Building Permits', 'الهندسة ورخص البناء', 'illegal_construction'),
  ('Municipal Police – Traffic & Parking', 'الشرطة البلدية – السير والمواقف', 'parking'),
  ('Public Health & Animal Control', 'الصحة العامة والحيوانات الشاردة', 'stray_animals'),
  ('Parks & Public Spaces', 'الحدائق والأماكن العامة', 'public_spaces');
