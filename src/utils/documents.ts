import { supabase } from './supabaseClient';
import { 
  Document, 
  DocumentType, 
  DocumentAuthor, 
  CreateDocumentInput, 
  UpdateDocumentInput,
  isResearchPaper,
  isPatent,
  isCertificate,
  isConferencePaper
} from '@/types/database.types';

async function isAdmin(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
    return ((data as any)?.role || '') === 'admin';
  } catch { return false; }
}

export async function listDocumentTypes(): Promise<DocumentType[]> {
  const { data, error } = await supabase
    .from('document_types')
    .select('*')
    .order('name');
    
  if (error) throw error;
  return data || [];
}

export async function getDocumentType(id: string): Promise<DocumentType | null> {
  const { data, error } = await supabase
    .from('document_types')
    .select('*')
    .eq('id', id)
    .single();
    
  if (error) return null;
  return data;
}

export async function listDocuments({
  typeId,
  status = 'published',
  userId,
  page = 1,
  pageSize = 10,
  searchTerm = '',
  sortBy = 'created_at',
  sortDir = 'desc',
}: {
  typeId?: string;
  status?: string;
  userId?: string;
  page?: number;
  pageSize?: number;
  searchTerm?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
} = {}) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  
  let query = supabase
    .from('documents')
    .select('*, type:document_types(*), authors:document_authors(*, user:users(id, full_name, email, avatar_url))', { count: 'exact' });

  // Fast-path search when no userId constraint (single query)
  if (!userId) {
    if (typeId) query = query.eq('type_id', typeId);
    if (status) query = query.eq('status', status);
    if (searchTerm) {
      const ors = [
        `title.ilike.%${searchTerm}%`,
        `description.ilike.%${searchTerm}%`,
        `metadata->>abstract.ilike.%${searchTerm}%`,
        `metadata->>journal.ilike.%${searchTerm}%`,
        `metadata->>conference_name.ilike.%${searchTerm}%`,
        `metadata->>patent_number.ilike.%${searchTerm}%`,
      ].join(',');
      query = query.or(ors);
    }
    query = query
      .order(sortBy, { ascending: sortDir === 'asc' })
      .range(from, to);
    const { data, error, count } = await query;
    if (error) throw error;
    // Load active user ids
    let activeSet = new Set<string>();
    try {
      const { data: activeUsers } = await supabase.from('users').select('id').eq('status', 'active');
      activeSet = new Set((activeUsers || []).map((u: any) => u.id));
    } catch {}
    const processedData = (data || [])
      .filter((doc: any) => !doc.created_by || activeSet.has(doc.created_by))
      .map((doc: any) => ({
      ...doc,
      primary_author: doc.authors?.find((a: any) => a.is_primary) || doc.authors?.[0],
    }));
    return {
      data: processedData as Document[],
      count: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    };
  }

  // When userId is present, avoid OR across related path. Split into owned and coauthored and merge.
  // Owned
  let ownedQuery = supabase
    .from('documents')
    .select('*, type:document_types(*), authors:document_authors(*, user:users(id, full_name, email, avatar_url))');
  if (typeId) ownedQuery = ownedQuery.eq('type_id', typeId);
  if (status) ownedQuery = ownedQuery.eq('status', status);
  if (searchTerm) {
    const ors = [
      `title.ilike.%${searchTerm}%`,
      `description.ilike.%${searchTerm}%`,
      `metadata->>abstract.ilike.%${searchTerm}%`,
      `metadata->>journal.ilike.%${searchTerm}%`,
      `metadata->>conference_name.ilike.%${searchTerm}%`,
      `metadata->>patent_number.ilike.%${searchTerm}%`,
    ].join(',');
    ownedQuery = ownedQuery.or(ors);
  }
  ownedQuery = ownedQuery.eq('created_by', userId).order(sortBy, { ascending: sortDir === 'asc' });
  const ownedRes = await ownedQuery;
  if (ownedRes.error) throw ownedRes.error;

  // Coauthored IDs
  const da = await supabase
    .from('document_authors')
    .select('document_id')
    .eq('user_id', userId);
  if (da.error) throw da.error;
  const ids = Array.from(new Set((da.data || []).map((r: any) => r.document_id)));

  let coauthored: any[] = [];
  if (ids.length > 0) {
    let coQ = supabase
      .from('documents')
      .select('*, type:document_types(*), authors:document_authors(*, user:users(id, full_name, email, avatar_url))')
      .in('id', ids);
    if (typeId) coQ = coQ.eq('type_id', typeId);
    if (status) coQ = coQ.eq('status', status);
    if (searchTerm) {
      const ors = [
        `title.ilike.%${searchTerm}%`,
        `description.ilike.%${searchTerm}%`,
        `metadata->>abstract.ilike.%${searchTerm}%`,
        `metadata->>journal.ilike.%${searchTerm}%`,
        `metadata->>conference_name.ilike.%${searchTerm}%`,
        `metadata->>patent_number.ilike.%${searchTerm}%`,
      ].join(',');
      coQ = coQ.or(ors);
    }
    coQ = coQ.order(sortBy, { ascending: sortDir === 'asc' });
    const coRes = await coQ;
    if (coRes.error) throw coRes.error;
    coauthored = coRes.data || [];
  }

  // Merge, de-duplicate and paginate client-side (simple, as user lists are small)
  const byId = new Map<string, any>();
  [...(ownedRes.data || []), ...coauthored].forEach((d: any) => byId.set(d.id, d));
  const merged = Array.from(byId.values());
  // Exclude docs by disabled users
  let activeSet = new Set<string>();
  try {
    const { data: activeUsers } = await supabase.from('users').select('id').eq('status', 'active');
    activeSet = new Set((activeUsers || []).map((u: any) => u.id));
  } catch {}
  const mergedActive = merged.filter((d: any) => !d.created_by || activeSet.has(d.created_by));
  const total = mergedActive.length;
  const paged = mergedActive.slice(from, to + 1);
  const processedData = paged.map((doc: any) => ({
    ...doc,
    primary_author: doc.authors?.find((a: any) => a.is_primary) || doc.authors?.[0],
  }));
  return {
    data: processedData as Document[],
    count: total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getDocument(id: string, userId?: string): Promise<Document | null> {
  const { data, error } = await supabase
    .from('documents')
    .select('*, type:document_types(*), authors:document_authors(*, user:users(id, full_name, email, avatar_url))')
    .eq('id', id)
    .single();
    
  if (error) return null;
  
  // Check if user has access
  const isOwner = data.created_by === userId;
  const isAuthor = data.authors?.some((a: any) => a.user_id === userId);
  const isPublished = data.status === 'published';
  const admin = await isAdmin(userId);
  
  if (!isPublished && !isOwner && !isAuthor && !admin) {
    return null;
  }
  
  return {
    ...data,
    primary_author: data.authors?.find((a: any) => a.is_primary) || data.authors?.[0],
  } as Document;
}

export async function createDocument(input: CreateDocumentInput, userId?: string): Promise<Document> {
  const { authors = [], ...docData } = input;
  const normalizeAuthors = (arr: any[]) => {
    // Ensure only one entry per user_id and only one primary author
    const byUser = new Map<string, any>();
    let primarySet = false;
    arr.forEach((a, idx) => {
      const uid = String(a.user_id || '').trim();
      if (!uid) return;
      if (!byUser.has(uid)) {
        const isPrim = Boolean(a.is_primary) && !primarySet;
        if (isPrim) primarySet = true;
        byUser.set(uid, {
          user_id: uid,
          is_primary: isPrim,
          order: typeof a.order === 'number' ? a.order : idx,
          role: a.role || 'author',
        });
      }
    });
    // If no primary assigned, make first one primary
    const list = Array.from(byUser.values()).sort((a,b)=> (a.order ?? 0) - (b.order ?? 0));
    if (!list.some(a=>a.is_primary) && list.length > 0) list[0].is_primary = true;
    // Normalize order indices
    return list.map((a, i) => ({ ...a, order: i }));
  };
  // Prefer Supabase auth user, fall back to provided userId
  const { data: authData } = await supabase.auth.getUser();
  const uid = authData?.user?.id || userId;
  if (!uid) throw new Error('Not authenticated');
  
  // Create the document
  const { data: document, error: docError } = await supabase
    .from('documents')
    .insert([{ ...docData, created_by: uid }])
    .select('*')
    .single();
    
  if (docError) throw docError;
  
  // Add authors if provided
  if (authors.length > 0) {
    const rows = normalizeAuthors(authors).map((a, index) => ({
      document_id: document.id,
      user_id: a.user_id,
      is_primary: a.is_primary || false,
      order: typeof a.order === 'number' ? a.order : index,
      role: a.role || 'author',
    }));
    const { error: authorError } = await supabase
      .from('document_authors')
      .insert(rows);
      
    if (authorError) {
      // Rollback document creation if authors fail
      await supabase.from('documents').delete().eq('id', document.id);
      throw authorError;
    }
  }
  
  // Return the full document with relations
  return getDocument(document.id, uid) as Promise<Document>;
}

export async function updateDocument(
  id: string, 
  input: UpdateDocumentInput,
  userId: string
): Promise<Document> {
  const { authors, ...updateData } = input;
  
  // Check if user has permission to update
  const { data: existingDoc } = await supabase
    .from('documents')
    .select('created_by')
    .eq('id', id)
    .single();
    
  if (!existingDoc) throw new Error('Document not found');
  if (existingDoc.created_by !== userId) {
    const admin = await isAdmin(userId);
    if (!admin) throw new Error('You do not have permission to update this document');
  }
  
  // Update the document
  const { error: docError } = await supabase
    .from('documents')
    .update(updateData)
    .eq('id', id);
    
  if (docError) throw docError;
  
  // Update authors if provided (diff-based to avoid PK conflicts)
  if (authors) {
    const normalizeAuthors = (arr: any[]) => {
      const byUser = new Map<string, any>();
      let primarySet = false;
      arr.forEach((a, idx) => {
        const uid = String(a.user_id || '').trim();
        if (!uid) return;
        if (!byUser.has(uid)) {
          const isPrim = Boolean(a.is_primary) && !primarySet;
          if (isPrim) primarySet = true;
          byUser.set(uid, {
            user_id: uid,
            is_primary: isPrim,
            order: typeof a.order === 'number' ? a.order : idx,
            role: a.role || 'author',
          });
        }
      });
      const list = Array.from(byUser.values()).sort((a,b)=> (a.order ?? 0) - (b.order ?? 0));
      if (!list.some(a=>a.is_primary) && list.length > 0) list[0].is_primary = true;
      return list.map((a, i) => ({ ...a, order: i }));
    };

    const desired = normalizeAuthors(authors);
    const { data: existingRows, error: existingErr } = await supabase
      .from('document_authors')
      .select('user_id, is_primary, order, role')
      .eq('document_id', id);
    if (existingErr) throw existingErr;
    const existing = (existingRows || []) as Array<{ user_id: string; is_primary: boolean; order: number; role: string }>;
    const existingSet = new Set(existing.map(e => e.user_id));
    const desiredSet = new Set(desired.map(d => d.user_id));

    const toDelete = existing.filter(e => !desiredSet.has(e.user_id)).map(e => e.user_id);
    const toInsert = desired.filter(d => !existingSet.has(d.user_id));
    const toUpdate = desired.filter(d => existingSet.has(d.user_id));

    // Delete removed authors
    if (toDelete.length > 0) {
      await supabase
        .from('document_authors')
        .delete()
        .eq('document_id', id)
        .in('user_id', toDelete);
    }

    // Update intersecting authors (per-row due to differing values)
    if (toUpdate.length > 0) {
      await Promise.all(
        toUpdate.map((a, index) =>
          supabase
            .from('document_authors')
            .update({
              is_primary: a.is_primary || false,
              order: typeof a.order === 'number' ? a.order : index,
              role: a.role || 'author',
            })
            .eq('document_id', id)
            .eq('user_id', a.user_id)
        )
      );
    }

    // Insert new authors
    if (toInsert.length > 0) {
      const rows = toInsert.map((a, index) => ({
        document_id: id,
        user_id: a.user_id,
        is_primary: a.is_primary || false,
        order: typeof a.order === 'number' ? a.order : index,
        role: a.role || 'author',
      }));
      const { error: authorError } = await supabase
        .from('document_authors')
        .insert(rows);
      if (authorError) throw authorError;
    }
  }
  
  // Return the updated document
  return getDocument(id, userId) as Promise<Document>;
}

export async function deleteDocument(id: string, userId: string): Promise<boolean> {
  // Check if user has permission to delete
  const { data: existingDoc } = await supabase
    .from('documents')
    .select('created_by, file_url')
    .eq('id', id)
    .single();
    
  if (!existingDoc) throw new Error('Document not found');
  const admin = await isAdmin(userId);
  if (existingDoc.created_by !== userId && !admin) {
    throw new Error('You do not have permission to delete this document');
  }
  
  // Delete from storage if file exists
  if (existingDoc.file_url) {
    const filePath = existingDoc.file_url.split('/').pop();
    if (filePath) {
      await supabase.storage
        .from('documents')
        .remove([filePath])
        .catch(console.error); // Log but don't fail if file deletion fails
    }
  }
  
  // Delete the document (cascade will delete authors)
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', id);
    
  if (error) throw error;
  return true;
}

// Helper function to get document type icon
// You can use an icon library like Lucide or Material Icons in your UI
export function getDocumentTypeIcon(typeId: string): string {
  switch (typeId) {
    case 'research_paper': return '📄';
    case 'patent': return '📜';
    case 'certificate': return '🏆';
    case 'conference_paper': return '🎤';
    default: return '📄';
  }
}

// Helper function to get document type color for UI
export function getDocumentTypeColor(typeId: string): string {
  switch (typeId) {
    case 'research_paper': return 'bg-blue-100 text-blue-800';
    case 'patent': return 'bg-purple-100 text-purple-800';
    case 'certificate': return 'bg-green-100 text-green-800';
    case 'conference_paper': return 'bg-amber-100 text-amber-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

// Function to get document type name
export function getDocumentTypeName(typeId: string, types: DocumentType[]): string {
  return types.find(t => t.id === typeId)?.name || typeId;
}

// Function to validate document metadata against schema
export function validateDocumentMetadata(
  metadata: Record<string, any>,
  schema: Record<string, any>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const requiredFields = schema.required || [];
  const properties = schema.properties || {};
  
  // Check required fields
  for (const field of requiredFields) {
    if (metadata[field] === undefined || metadata[field] === null || metadata[field] === '') {
      const fieldName = (properties as any)[field]?.title || field;
      errors.push(`${fieldName} is required`);
    }
  }
  
  // Check field types
  for (const [field, def] of Object.entries(properties)) {
    const value = metadata[field];
    if (value === undefined || value === null) continue;
    
    const defAny = def as any;
    const fieldType = defAny?.type;
    const format = defAny?.format;
    const label = defAny?.title || field;
    
    if (fieldType === 'string' && format === 'date' && isNaN(Date.parse(value))) {
      errors.push(`${label} must be a valid date`);
    } else if (fieldType === 'array' && !Array.isArray(value)) {
      errors.push(`${label} must be an array`);
    } else if (fieldType === 'boolean' && typeof value !== 'boolean') {
      errors.push(`${label} must be a boolean`);
    } else if (fieldType === 'number' && typeof value !== 'number') {
      errors.push(`${label} must be a number`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
