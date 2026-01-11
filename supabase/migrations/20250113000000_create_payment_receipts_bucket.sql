/*
  # Create Storage Bucket for Payment Receipts

  This migration creates the storage bucket needed for uploading payment receipt images.
*/

-- Create storage bucket for payment receipts
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-receipts',
  'payment-receipts',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO NOTHING;

-- Allow public read access to payment receipts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Public read access for payment receipts'
  ) THEN
    CREATE POLICY "Public read access for payment receipts"
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'payment-receipts');
  END IF;
END $$;

-- Allow public uploads for payment receipts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Public can upload payment receipts'
  ) THEN
    CREATE POLICY "Public can upload payment receipts"
    ON storage.objects
    FOR INSERT
    TO public
    WITH CHECK (bucket_id = 'payment-receipts');
  END IF;
END $$;




