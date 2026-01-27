-- Make receipt_url nullable so orders can be created without a receipt
-- (receipt upload was removed from the top-up flow)
ALTER TABLE orders
  ALTER COLUMN receipt_url DROP NOT NULL;

COMMENT ON COLUMN orders.receipt_url IS 'URL to payment receipt image; null when receipt upload was not used';
