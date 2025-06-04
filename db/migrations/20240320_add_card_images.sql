-- Add image columns to cards table
ALTER TABLE cards
ADD COLUMN front_image VARCHAR(255) AFTER audio_url,
ADD COLUMN back_image VARCHAR(255) AFTER front_image; 