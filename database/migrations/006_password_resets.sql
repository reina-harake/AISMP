-- "Forgot password?": one-time reset links. Only a SHA-256 hash of the token is stored, so a
-- database leak does not give working links. Links expire after 1 hour and work once. Run once:
--   docker compose exec -T db mysql -uaismp -paismp_pass aismp < database/migrations/006_password_resets.sql
CREATE TABLE IF NOT EXISTS password_resets (
  reset_id    INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  token_hash  CHAR(64) NOT NULL UNIQUE,
  expires_at  DATETIME NOT NULL,
  used_at     DATETIME NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_reset_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
