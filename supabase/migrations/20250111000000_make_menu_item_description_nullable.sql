-- Make description column nullable in menu_items table
-- Since we removed the description field from the admin form

ALTER TABLE menu_items
ALTER COLUMN description DROP NOT NULL;





