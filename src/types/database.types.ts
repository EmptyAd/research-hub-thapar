export type DocumentStatus = 'draft' | 'under_review' | 'published' | 'archived';

export interface DocumentType {
  id: string;
  name: string;
  description: string | null;
  schema: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  type_id: string;
  title: string;
  description: string | null;
  file_url: string | null;
  status: DocumentStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  metadata: Record<string, any>;
  // Relations
  type?: DocumentType;
  authors?: DocumentAuthor[];
  primary_author?: DocumentAuthor;
}

export interface DocumentAuthor {
  document_id: string;
  user_id: string;
  is_primary: boolean;
  order: number;
  role: string;
  created_at: string;
  // Relations
  user?: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  };
}

// Type-specific interfaces
export interface ResearchPaperMetadata {
  abstract: string;
  journal: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  is_published: boolean;
  publication_date: string;
}

export interface PatentMetadata {
  patent_number: string;
  filing_date: string;
  grant_date?: string;
  inventors: string[];
  assignee?: string;
  status: 'pending' | 'granted' | 'expired';
  ipc_class?: string;
}

export interface CertificateMetadata {
  certificate_number?: string;
  issue_date: string;
  expiry_date?: string;
  issuing_authority: string;
  credential_url?: string;
  skills?: string[];
}

export interface ConferencePaperMetadata {
  conference_name: string;
  conference_date: string;
  location?: string;
  proceedings_title?: string;
  pages?: string;
  doi?: string;
  presentation_url?: string;
}

// Union type for all possible metadata types
export type DocumentMetadata = 
  | ResearchPaperMetadata 
  | PatentMetadata 
  | CertificateMetadata 
  | ConferencePaperMetadata
  | Record<string, any>;

// Type guards
export function isResearchPaper(doc: Document): doc is Document & { metadata: ResearchPaperMetadata } {
  return doc.type_id === 'research_paper';
}

export function isPatent(doc: Document): doc is Document & { metadata: PatentMetadata } {
  return doc.type_id === 'patent';
}

export function isCertificate(doc: Document): doc is Document & { metadata: CertificateMetadata } {
  return doc.type_id === 'certificate';
}

export function isConferencePaper(doc: Document): doc is Document & { metadata: ConferencePaperMetadata } {
  return doc.type_id === 'conference_paper';
}

// Type for creating/updating documents
export interface CreateDocumentInput {
  type_id: string;
  title: string;
  description?: string | null;
  file_url?: string | null;
  status?: DocumentStatus;
  metadata: Record<string, any>;
  authors?: Array<{
    user_id: string;
    is_primary?: boolean;
    order?: number;
    role?: string;
  }>;
}

export interface UpdateDocumentInput extends Partial<Omit<CreateDocumentInput, 'type_id'>> {
  id: string;
}
