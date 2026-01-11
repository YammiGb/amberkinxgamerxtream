-- Add sort_order column to variations table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'variations' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE variations ADD COLUMN sort_order integer DEFAULT 0;
    
    -- Set initial sort_order based on price (lowest to highest) for existing variations
    -- Update sort_order for each menu_item's variations ordered by price
    WITH ranked_variations AS (
      SELECT 
        id,
        ROW_NUMBER() OVER (PARTITION BY menu_item_id ORDER BY price ASC) - 1 AS new_sort_order
      FROM variations
    )
    UPDATE variations v
    SET sort_order = rv.new_sort_order
    FROM ranked_variations rv
    WHERE v.id = rv.id;
  END IF;
END $$;

-- Create index on sort_order for better query performance
CREATE INDEX IF NOT EXISTS idx_variations_sort_order ON variations(menu_item_id, sort_order);


