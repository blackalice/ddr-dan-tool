-- Create user_data table for per-user JSON blob
CREATE TABLE IF NOT EXISTS user_data (
  user_id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

