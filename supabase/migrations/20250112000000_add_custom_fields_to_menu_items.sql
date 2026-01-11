/*
  # Add Custom Fields to Menu Items
  
  This migration adds support for custom fields that can be defined per menu item.
  These fields will appear in the customer information section during checkout.
  
  Custom fields are stored as JSONB array with structure:
  [
    {
      "label": "ID with tag",
      "key": "id_with_tag",
      "required": true,
      "placeholder": "ID with tag (If Riot ID)"
    }
  ]
*/

-- Add custom_fields column to menu_items table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menu_items' AND column_name = 'custom_fields'
  ) THEN
    ALTER TABLE menu_items ADD COLUMN custom_fields jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;





