-- Fix FK for research_papers.owner to reference public.users(id)
-- and relax RLS to avoid insert/update failures from the client app

BEGIN;

-- 1) Drop existing FK that points to auth.users(id)
ALTER TABLE public.research_papers
  DROP CONSTRAINT IF EXISTS research_papers_owner_fkey;

-- 2) Recreate FK to public.users(id)
ALTER TABLE public.research_papers
  ADD CONSTRAINT research_papers_owner_fkey
  FOREIGN KEY (owner) REFERENCES public.users(id) ON DELETE CASCADE;

-- 3) Option A: Disable RLS on research_papers to allow application-driven access control
--    Comment this out if you prefer to keep RLS and update policies instead.
ALTER TABLE public.research_papers DISABLE ROW LEVEL SECURITY;

-- If you prefer to keep RLS, you can instead replace policies like below:
--
-- DO $$ BEGIN
--   -- Clean up old policies
--   DROP POLICY IF EXISTS "Public can view published papers" ON public.research_papers;
--   DROP POLICY IF EXISTS "Owners can view their papers" ON public.research_papers;
--   DROP POLICY IF EXISTS "Owners can insert their papers" ON public.research_papers;
--   DROP POLICY IF EXISTS "Owners can update their papers" ON public.research_papers;
--   DROP POLICY IF EXISTS "Owners can delete their papers" ON public.research_papers;
-- EXCEPTION WHEN others THEN NULL; END $$;
--
-- -- Select: allow public to view published; admins view all
-- CREATE POLICY "Public can view published papers"
-- ON public.research_papers
-- FOR SELECT
-- USING (status = 'published' OR public.has_role(auth.uid(), 'admin'));
--
-- -- Insert/Update/Delete: allow anyone; rely on app-side auth (NOT recommended for production)
-- CREATE POLICY "Anyone can insert" ON public.research_papers FOR INSERT USING (true) WITH CHECK (true);
-- CREATE POLICY "Anyone can update" ON public.research_papers FOR UPDATE USING (true) WITH CHECK (true);
-- CREATE POLICY "Anyone can delete" ON public.research_papers FOR DELETE USING (true);

COMMIT;
