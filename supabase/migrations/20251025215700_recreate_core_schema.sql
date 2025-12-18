-- Recreate core schema for ThaparAcad app
-- This creates enums, users, and research_papers with correct FKs and helpful indexes.

BEGIN;

-- Extensions (id generation helper)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enums
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'department_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.department_type AS ENUM ('csed','eced','mced','eid','med','btd','ees','ced');
  END IF;
END $$;

-- users table
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  department public.department_type NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- research_papers table (aligned with src/utils/research.ts)
CREATE TABLE IF NOT EXISTS public.research_papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  authors TEXT[] NOT NULL DEFAULT '{}',
  journal TEXT NULL,
  conference TEXT NULL,
  publication_year INT NULL,
  doi TEXT NULL,
  external_link TEXT NULL,
  abstract TEXT NULL,
  department public.department_type NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  file_url TEXT NULL,
  co_author_ids UUID[] NULL DEFAULT '{}',
  status TEXT NULL CHECK (status IN ('published','under_review')),
  issue_date DATE NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Update updated_at trigger function (idempotent)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to research_papers
DROP TRIGGER IF EXISTS trg_research_papers_updated_at ON public.research_papers;
CREATE TRIGGER trg_research_papers_updated_at
BEFORE UPDATE ON public.research_papers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_research_papers_status ON public.research_papers(status);
CREATE INDEX IF NOT EXISTS idx_research_papers_issue_date ON public.research_papers(issue_date);
CREATE INDEX IF NOT EXISTS idx_research_papers_keywords ON public.research_papers USING GIN (keywords);

-- RLS: keep disabled for now to simplify client integration
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_papers DISABLE ROW LEVEL SECURITY;

COMMIT;
