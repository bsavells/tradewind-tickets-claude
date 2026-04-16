-- Allow these FK columns to be null so we can preserve the data
-- when a user is permanently deleted.
ALTER TABLE ticket_photos ALTER COLUMN uploaded_by DROP NOT NULL;
ALTER TABLE ticket_exports ALTER COLUMN generated_by DROP NOT NULL;
