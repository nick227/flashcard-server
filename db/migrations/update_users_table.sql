-- First update any NULL bio values
UPDATE users SET bio = 'No bio provided' WHERE bio IS NULL;

-- Then add the NOT NULL constraint
ALTER TABLE users MODIFY COLUMN bio TEXT NOT NULL;

-- Add unique constraint to name
ALTER TABLE users ADD UNIQUE INDEX idx_users_name (name); 