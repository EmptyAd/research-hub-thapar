-- Create document_types table
CREATE TABLE IF NOT EXISTS public.document_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on document_types
ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;

-- Create policy: Allow public read access to document types
CREATE POLICY "Enable read access for all users" 
ON public.document_types 
FOR SELECT 
TO public 
USING (true);

-- Create documents table (replacing research_papers)
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id TEXT NOT NULL REFERENCES public.document_types(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'under_review', 'published', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Create document_authors table for many-to-many relationship
CREATE TABLE IF NOT EXISTS public.document_authors (
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  "order" INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'author',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (document_id, user_id)
);

-- Enable RLS on documents
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for documents
CREATE POLICY "Enable read access for published documents" 
ON public.documents 
FOR SELECT 
TO public 
USING (status = 'published');

CREATE POLICY "Enable all access for document owners"
ON public.documents
FOR ALL
TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Enable read access for authenticated users"
ON public.documents
FOR SELECT
TO authenticated
USING (true);

-- Enable RLS on document_authors
ALTER TABLE public.document_authors ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for document_authors
CREATE POLICY "Enable read access for document authors"
ON public.document_authors
FOR SELECT
TO public
USING (EXISTS (
  SELECT 1 FROM public.documents d 
  WHERE d.id = document_id 
  AND d.status = 'published'
));

-- Create indexes
CREATE INDEX idx_documents_type ON public.documents(type_id);
CREATE INDEX idx_documents_status ON public.documents(status);
CREATE INDEX idx_documents_created_by ON public.documents(created_by);
CREATE INDEX idx_document_authors_user ON public.document_authors(user_id);

-- Insert default document types
INSERT INTO public.document_types (id, name, description, schema) VALUES
('research_paper', 'Research Paper', 'Academic research papers published in journals or conferences', '{"required": ["abstract", "publication_date"], "properties": {"abstract": {"type": "string", "title": "Abstract"}, "journal": {"type": "string", "title": "Journal/Conference"}, "volume": {"type": "string", "title": "Volume"}, "issue": {"type": "string", "title": "Issue"}, "pages": {"type": "string", "title": "Pages"}, "doi": {"type": "string", "title": "DOI"}, "is_published": {"type": "boolean", "title": "Published"}, "publication_date": {"type": "string", "format": "date", "title": "Publication Date"}}}'),
('patent', 'Patent', 'Intellectual property patents', '{"required": ["patent_number", "filing_date"], "properties": {"patent_number": {"type": "string", "title": "Patent Number"}, "filing_date": {"type": "string", "format": "date", "title": "Filing Date"}, "grant_date": {"type": "string", "format": "date", "title": "Grant Date"}, "inventors": {"type": "array", "title": "Inventors", "items": {"type": "string"}}, "assignee": {"type": "string", "title": "Assignee"}, "status": {"type": "string", "enum": ["pending", "granted", "expired"], "title": "Status"}, "ipc_class": {"type": "string", "title": "IPC Class"}}}'),
('certificate', 'Certificate', 'Professional or academic certificates', '{"required": ["issue_date", "issuing_authority"], "properties": {"certificate_number": {"type": "string", "title": "Certificate Number"}, "issue_date": {"type": "string", "format": "date", "title": "Issue Date"}, "expiry_date": {"type": "string", "format": "date", "title": "Expiry Date"}, "issuing_authority": {"type": "string", "title": "Issuing Authority"}, "credential_url": {"type": "string", "format": "uri", "title": "Credential URL"}, "skills": {"type": "array", "title": "Skills", "items": {"type": "string"}}}}'),
('conference_paper', 'Conference Paper', 'Papers presented at academic conferences', '{"required": ["conference_name", "conference_date"], "properties": {"conference_name": {"type": "string", "title": "Conference Name"}, "conference_date": {"type": "string", "format": "date", "title": "Conference Date"}, "location": {"type": "string", "title": "Location"}, "proceedings_title": {"type": "string", "title": "Proceedings Title"}, "pages": {"type": "string", "title": "Pages"}, "doi": {"type": "string", "title": "DOI"}, "presentation_url": {"type": "string", "format": "uri", "title": "Presentation URL"}}}')
ON CONFLICT (id) DO NOTHING;

-- Create a function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_modified_column() 
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW; 
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_documents_modtime
BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_document_types_modtime
BEFORE UPDATE ON public.document_types
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Create a view for research papers (backward compatibility)
CREATE OR REPLACE VIEW public.research_papers AS
SELECT 
  d.id,
  d.title,
  d.description,
  d.file_url,
  d.status,
  d.created_at,
  d.updated_at,
  d.created_by,
  d.metadata->>'abstract' as abstract,
  d.metadata->>'journal' as journal,
  d.metadata->>'volume' as volume,
  d.metadata->>'issue' as issue,
  d.metadata->>'pages' as pages,
  d.metadata->>'doi' as doi,
  (d.metadata->>'is_published')::boolean as is_published,
  (d.metadata->>'publication_date')::date as publication_date
FROM public.documents d
WHERE d.type_id = 'research_paper';

-- Grant permissions
GRANT SELECT ON public.document_types TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_authors TO authenticated;

-- Create a function to check if a user is an author of a document
CREATE OR REPLACE FUNCTION is_document_author(document_id UUID, user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.document_authors 
    WHERE document_id = $1 AND user_id = $2
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
