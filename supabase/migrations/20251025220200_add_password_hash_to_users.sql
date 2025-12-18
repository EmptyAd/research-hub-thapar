-- Add password_hash column expected by the app's auth flow
BEGIN;
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;
COMMIT;
