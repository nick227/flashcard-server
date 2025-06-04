-- Update card table structure to use TEXT for front/back and add image columns
ALTER TABLE cards
MODIFY COLUMN front TEXT NOT NULL,
MODIFY COLUMN back TEXT NOT NULL,
ADD COLUMN front_image VARCHAR(255) AFTER front,
ADD COLUMN back_image VARCHAR(255) AFTER back; 