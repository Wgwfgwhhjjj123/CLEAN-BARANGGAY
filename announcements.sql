-- Run this once in your MySQL (SQL editor / Workbench / phpMyAdmin)
CREATE TABLE IF NOT EXISTS announcements (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    title       VARCHAR(120) NOT NULL,
    message     TEXT NOT NULL,
    pinned      TINYINT(1) NOT NULL DEFAULT 0,
    created_by  VARCHAR(100),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at  DATETIME NULL
);
