CREATE DATABASE IF NOT EXISTS apartment_visitor_management
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE apartment_visitor_management;

CREATE TABLE IF NOT EXISTS residents (
  resident_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  flat_no VARCHAR(20) NOT NULL,
  phone VARCHAR(15),
  email VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_resident_name (name),
  INDEX idx_resident_flat (flat_no)
);

CREATE TABLE IF NOT EXISTS visitors (
  visitor_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(15),
  vehicle_no VARCHAR(30),
  purpose VARCHAR(150) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_visitor_name (name),
  INDEX idx_visitor_phone (phone)
);

CREATE TABLE IF NOT EXISTS visits (
  visit_id INT AUTO_INCREMENT PRIMARY KEY,
  resident_id INT NOT NULL,
  visitor_id INT NOT NULL,
  entry_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  exit_time DATETIME NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Inside',
  CONSTRAINT fk_visits_resident FOREIGN KEY (resident_id) REFERENCES residents(resident_id),
  CONSTRAINT fk_visits_visitor FOREIGN KEY (visitor_id) REFERENCES visitors(visitor_id),
  INDEX idx_visit_resident (resident_id),
  INDEX idx_visit_visitor (visitor_id),
  INDEX idx_visit_entry (entry_time),
  INDEX idx_visit_status (status)
);

CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('security','resident') NOT NULL,
  resident_id INT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_resident FOREIGN KEY (resident_id) REFERENCES residents(resident_id)
);

-- Demo residents and visitor records. Demo login passwords are documented in README.md.
INSERT IGNORE INTO residents (resident_id, name, flat_no, phone, email) VALUES
(1, 'Aarav Sharma', 'A-101', '9876543210', 'aarav@example.com'),
(2, 'Priya Reddy', 'B-204', '9876543211', 'priya@example.com'),
(3, 'Rahul Kumar', 'C-305', '9876543212', 'rahul@example.com');

INSERT IGNORE INTO visitors (visitor_id, name, phone, vehicle_no, purpose) VALUES
(1, 'Meera Sharma', '9123456780', 'AP 09 AB 1234', 'Family visit'),
(2, 'Delivery Partner', '9123456781', '', 'Food delivery'),
(3, 'Sanjay Rao', '9123456782', 'AP 09 XY 9876', 'Meeting');

INSERT IGNORE INTO visits (visit_id, resident_id, visitor_id, entry_time, exit_time, status) VALUES
(1, 1, 1, NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 2 DAY + INTERVAL 45 MINUTE, 'Exited'),
(2, 2, 2, NOW() - INTERVAL 1 HOUR, NULL, 'Inside');

-- Demo credentials are seeded by server.js on startup, with bcrypt hashes.
