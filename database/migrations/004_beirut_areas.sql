-- The platform now serves Beirut only and complaints.area holds one of the 12 district names
-- (see backend/src/config/beirut.js). Maps the neighbourhood names used by older demo data.
-- Other free-text areas are left as they were (staff can still see them). Run once:
--   docker compose exec -T db mysql -uaismp -paismp_pass aismp < database/migrations/004_beirut_areas.sql
SET NAMES utf8mb4;

UPDATE complaints SET area = 'Ras Beirut'  WHERE area IN ('Hamra', 'hamra', 'الحمرا', 'Ras Beyrouth');
UPDATE complaints SET area = 'Mousseitbeh' WHERE area IN ('Verdun', 'verdun', 'فردان');
UPDATE complaints SET area = 'Achrafieh'   WHERE area IN ('achrafieh', 'Ashrafieh', 'Achrafiyeh', 'الأشرفية');
