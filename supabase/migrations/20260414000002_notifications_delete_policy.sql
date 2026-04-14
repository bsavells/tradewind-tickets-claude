-- Allow users to delete their own notifications (for "Clear read" feature)
CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  USING (recipient_id = auth.uid());
