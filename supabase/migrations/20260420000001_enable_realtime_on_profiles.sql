-- Publish profiles table to realtime so the client can react immediately
-- when an admin disables a user (flips active=false). The client's
-- AuthContext subscribes to UPDATE events on its own profile row and
-- signs the user out the moment it sees active=false.
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
