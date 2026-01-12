/*
  # Add sort_order to menu_items table
  
  This migration adds a sort_order column to menu_items table
  to allow sorting items within their categories.
*/

-- Add sort_order column to menu_items table
ALTER TABLE menu_items
ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Create index for better query performance when sorting by category and sort_order
CREATE INDEX IF NOT EXISTS idx_menu_items_category_sort 
ON menu_items(category, sort_order);
