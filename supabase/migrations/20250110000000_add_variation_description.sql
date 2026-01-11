/*
  # Add description field to variations table
  
  This migration adds a description column to the variations table
  so each currency package can have its own description.
*/

-- Add description column to variations table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'variations' AND column_name = 'description'
  ) THEN
    ALTER TABLE variations ADD COLUMN description text;
  END IF;
END $$;





