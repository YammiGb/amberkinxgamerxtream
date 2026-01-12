-- Add category and sort columns to variations table
DO $$
BEGIN
  -- Add category column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'variations' AND column_name = 'category'
  ) THEN
    ALTER TABLE variations ADD COLUMN category text;
  END IF;

  -- Add sort column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'variations' AND column_name = 'sort'
  ) THEN
    ALTER TABLE variations ADD COLUMN sort integer DEFAULT 0;
  END IF;
END $$;
