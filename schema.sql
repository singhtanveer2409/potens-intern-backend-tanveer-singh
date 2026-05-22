-- Database creation script
CREATE DATABASE IF NOT EXISTS log_service_db;
USE log_service_db;

-- Logs table structure for storing append-only, tamper-evident log records
CREATE TABLE IF NOT EXISTS logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    actor VARCHAR(255) NOT NULL,
    action VARCHAR(255) NOT NULL,
    payload JSON NOT NULL,
    previous_hash TEXT,
    current_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
