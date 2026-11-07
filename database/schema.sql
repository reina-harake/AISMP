-- =====================================================================
-- AISMP - AI Smart Municipality Platform
-- Database schema (MySQL 8 / MariaDB 10.6+)
-- Mirrors the ER diagram in the proposal (section 3.4):
--   USER 1-N COMPLAINT, USER 1-N REQUEST, USER 1-N NOTIFICATION,
--   EMPLOYEE N-1 DEPARTMENT, COMPLAINT N-1 DEPARTMENT,
--   EMPLOYEE 1-N COMPLAINT (handles), COMPLAINT 1-N COMPLAINT_STATUS (history),
--   EMPLOYEE 1-N COMPLAINT_STATUS (updates)
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS departments (
  department_id   INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100) NOT NULL UNIQUE,
  name_ar         VARCHAR(100) NULL,
  -- complaint category this department handles by default (auto-routing)
  category        ENUM('road_damage','street_lighting','electricity','water','waste','noise','illegal_construction','parking','stray_animals','public_spaces','other') NULL UNIQUE,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  user_id         INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(120) NOT NULL,
  email           VARCHAR(190) NOT NULL UNIQUE,
  phone           VARCHAR(30) NULL,
  national_id_file VARCHAR(255) NULL,              -- copy of the national ID uploaded at registration (citizens)
  password_hash   VARCHAR(255) NOT NULL,
  role            ENUM('citizen','employee','admin') NOT NULL DEFAULT 'citizen',
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  points          INT NOT NULL DEFAULT 0,          -- gamification (section 3.7)
  language        ENUM('en','ar','fr') NOT NULL DEFAULT 'en',  -- UI + notification language
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employees (
  employee_id     INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NOT NULL UNIQUE,
  department_id   INT NOT NULL,
  job_title       VARCHAR(100) NULL,
  CONSTRAINT fk_emp_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_emp_dept FOREIGN KEY (department_id) REFERENCES departments(department_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS complaints (
  complaint_id         INT AUTO_INCREMENT PRIMARY KEY,
  citizen_id           INT NOT NULL,
  title                VARCHAR(200) NOT NULL,
  description          TEXT NOT NULL,
  language             ENUM('en','fr','ar','arabizi','mixed','unknown') NOT NULL DEFAULT 'unknown',

  category             ENUM('road_damage','street_lighting','electricity','water','waste','noise','illegal_construction','parking','stray_animals','public_spaces','other') NOT NULL DEFAULT 'other',
  category_confidence  DECIMAL(5,4) NULL,
  category_source      ENUM('ai','fallback','manual') NOT NULL DEFAULT 'ai',

  priority             ENUM('critical','high','medium','low') NOT NULL DEFAULT 'medium',
  priority_score       DECIMAL(5,4) NULL,
  priority_source      ENUM('ai','fallback','manual') NOT NULL DEFAULT 'ai',

  status               ENUM('submitted','under_review','assigned','in_progress','resolved','rejected')
                         NOT NULL DEFAULT 'submitted',

  area                 VARCHAR(120) NULL,            -- neighbourhood / district
  address              VARCHAR(255) NULL,
  latitude             DECIMAL(9,6) NULL,
  longitude            DECIMAL(9,6) NULL,

  department_id        INT NULL,
  assigned_employee_id INT NULL,

  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolved_at          TIMESTAMP NULL,

  CONSTRAINT fk_cmp_citizen  FOREIGN KEY (citizen_id) REFERENCES users(user_id),
  CONSTRAINT fk_cmp_dept     FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE SET NULL,
  CONSTRAINT fk_cmp_employee FOREIGN KEY (assigned_employee_id) REFERENCES employees(employee_id) ON DELETE SET NULL,

  INDEX idx_cmp_status (status),
  INDEX idx_cmp_category (category),
  INDEX idx_cmp_priority (priority),
  INDEX idx_cmp_area_cat (area, category, created_at),
  INDEX idx_cmp_dept (department_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "Upload Evidence" use case
CREATE TABLE IF NOT EXISTS complaint_attachments (
  attachment_id   INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id    INT NOT NULL,
  file_name       VARCHAR(255) NOT NULL,   -- stored (random) name on disk
  original_name   VARCHAR(255) NOT NULL,
  mime_type       VARCHAR(100) NOT NULL,
  size_bytes      INT NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_att_cmp FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ComplaintStatus entity: full audit trail of status changes
CREATE TABLE IF NOT EXISTS complaint_status_history (
  status_id       INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id    INT NOT NULL,
  status          ENUM('submitted','under_review','assigned','in_progress','resolved','rejected') NOT NULL,
  note            VARCHAR(500) NULL,
  changed_by      INT NULL,                -- user who made the change
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_hist_cmp  FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id) ON DELETE CASCADE,
  CONSTRAINT fk_hist_user FOREIGN KEY (changed_by) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_hist_cmp (complaint_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- REQUEST entity: administrative document requests
CREATE TABLE IF NOT EXISTS requests (
  request_id      INT AUTO_INCREMENT PRIMARY KEY,
  citizen_id      INT NOT NULL,
  type            ENUM('residence_certificate','building_permit','business_license',
                       'civil_record','construction_permit','other') NOT NULL,
  details         TEXT NULL,
  status          ENUM('submitted','under_review','approved','rejected','ready') NOT NULL DEFAULT 'submitted',
  handled_by      INT NULL,                -- employee_id
  response_note   VARCHAR(500) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_req_citizen FOREIGN KEY (citizen_id) REFERENCES users(user_id),
  CONSTRAINT fk_req_emp     FOREIGN KEY (handled_by) REFERENCES employees(employee_id) ON DELETE SET NULL,
  INDEX idx_req_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NOT NULL,
  message         VARCHAR(500) NOT NULL,
  link            VARCHAR(255) NULL,
  is_read         TINYINT(1) NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_notif_user (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default departments (one per complaint category, used for auto-routing)
INSERT IGNORE INTO departments (name, name_ar, category) VALUES
  ('Roads & Public Works', 'الأشغال العامة والطرقات', 'road_damage'),
  ('Electricity',          'الكهرباء',                'electricity'),
  ('Water & Sewage',       'المياه والصرف الصحي',      'water'),
  ('Waste Management',     'إدارة النفايات',           'waste'),
  ('Street Lighting',      'الإنارة العامة',           'street_lighting'),
  ('Municipal Police – Noise', 'الشرطة البلدية – الضجيج', 'noise'),
  ('Engineering & Building Permits', 'الهندسة ورخص البناء', 'illegal_construction'),
  ('Municipal Police – Traffic & Parking', 'الشرطة البلدية – السير والمواقف', 'parking'),
  ('Public Health & Animal Control', 'الصحة العامة والحيوانات الشاردة', 'stray_animals'),
  ('Parks & Public Spaces', 'الحدائق والأماكن العامة', 'public_spaces'),
  ('General Services',     'الخدمات العامة',           'other');
