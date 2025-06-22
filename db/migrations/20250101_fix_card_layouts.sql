-- Migration to fix card layouts for cards with both text and images
-- Update cards that have both text and images to use 'two-row' layout

UPDATE cards 
SET layout_front = 'two-row' 
WHERE front IS NOT NULL 
  AND front != '' 
  AND front_image IS NOT NULL 
  AND front_image != '' 
  AND layout_front = 'default';

UPDATE cards 
SET layout_back = 'two-row' 
WHERE back IS NOT NULL 
  AND back != '' 
  AND back_image IS NOT NULL 
  AND back_image != '' 
  AND layout_back = 'default'; 