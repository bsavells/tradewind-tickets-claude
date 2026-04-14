-- Add dismissed column so notifications can be cleared from the popup
-- without being removed from history
ALTER TABLE notifications ADD COLUMN dismissed boolean NOT NULL DEFAULT false;
