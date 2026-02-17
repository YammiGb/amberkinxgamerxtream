-- Atomic invoice number generation to prevent race conditions when multiple orders
-- are placed simultaneously. Uses advisory lock to ensure only one order gets each number.

CREATE OR REPLACE FUNCTION get_next_invoice_number(p_date TEXT)
RETURNS INT AS $$
DECLARE
  next_num INT;
  current_date_val TEXT;
  current_count INT;
BEGIN
  -- Advisory lock: only one transaction can run this at a time across all clients.
  -- Prevents duplicate invoice numbers when multiple orders are placed concurrently.
  PERFORM pg_advisory_xact_lock(hashtext('invoice_sequence'));

  SELECT value INTO current_date_val FROM site_settings WHERE id = 'invoice_count_date';
  SELECT COALESCE(NULLIF(trim(value), '')::int, 0) INTO current_count FROM site_settings WHERE id = 'invoice_count';

  IF current_date_val IS NULL OR current_date_val != p_date THEN
    -- New day: reset count to 1
    next_num := 1;
    INSERT INTO site_settings (id, value, type, description)
    VALUES ('invoice_count', '1', 'number', 'Current invoice count for the day')
    ON CONFLICT (id) DO UPDATE SET value = '1';

    INSERT INTO site_settings (id, value, type, description)
    VALUES ('invoice_count_date', p_date, 'text', 'Date of the current invoice count (YYYY-MM-DD format)')
    ON CONFLICT (id) DO UPDATE SET value = p_date;
  ELSE
    -- Same day: increment
    next_num := current_count + 1;
    UPDATE site_settings SET value = next_num::text WHERE id = 'invoice_count';
  END IF;

  RETURN next_num;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to anon and authenticated (orders can be placed by both)
GRANT EXECUTE ON FUNCTION get_next_invoice_number(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_next_invoice_number(TEXT) TO authenticated;
