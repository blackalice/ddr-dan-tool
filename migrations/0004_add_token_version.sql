-- Add token_version for logout-all support
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1;

