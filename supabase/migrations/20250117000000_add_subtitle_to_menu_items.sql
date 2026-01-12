-- Add subtitle column to menu_items table
ALTER TABLE menu_items
ADD COLUMN IF NOT EXISTS subtitle TEXT;

-- Add comment to explain the column
COMMENT ON COLUMN menu_items.subtitle IS 'Custom text to display below the game title on the customer side';
