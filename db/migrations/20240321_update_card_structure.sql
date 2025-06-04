-- Update card table structure to match new format
ALTER TABLE cards
MODIFY COLUMN front JSON NOT NULL,
MODIFY COLUMN back JSON NOT NULL,
DROP COLUMN front_image,
DROP COLUMN back_image; 