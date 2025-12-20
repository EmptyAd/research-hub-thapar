import { supabase } from '@/utils/supabaseClient';
import { logAudit } from '@/utils/audit';
import type { DepartmentType } from '@/utils/auth';

export type ResearchPaper = {
  id: string;
  owner: string;
  title: string;
  authors: string[];
  journal?: string | null;
  conference?: string | null;
  publication_year?: number | null;
  doi?: string | null;
  external_link?: string | null;
  abstract?: string | null;
  department?: DepartmentType | null;
  keywords?: string[] | null;
  file_url?: string | null;
  co_author_ids?: string[] | null;
  status?: 'published' | 'under_review' | null;
  issue_date?: string | null; // ISO date string (YYYY-MM-DD)
  created_at: string;
  updated_at: string;
};

export type PaperFilters = {
  q?: string;
  department?: DepartmentType | '';
  year?: number | '';
  keyword?: string;
  status?: 'published' | 'under_review' | '';
  ownerId?: string;
};

export type ListOptions = {
  page?: number; // 1-based
  pageSize?: number; // default 10
  dateFrom?: string; // YYYY-MM-DD (issue_date >=)
  dateTo?: string;   // YYYY-MM-DD (issue_date <=)
  sortBy?: 'created_at' | 'issue_date' | 'title' | 'status' | 'department' | 'authors' | 'publication_year';
  sortDir?: 'asc' | 'desc';
  fetchAll?: boolean; // if true, do not apply SQL range; fetch all rows first
};

const TABLE = 'research_papers_simple';

export async function listPapers(filters: PaperFilters = {}, options: ListOptions = {}) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? 10);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const sortBy = options.sortBy || 'created_at';
  const ascending = (options.sortDir || 'desc') === 'asc';
  const wantAll = !!options.fetchAll;
  // If listing for a specific owner, read via documents (owner or co-author) and filter client-side.
  if (filters.ownerId) {
    const mine = await getMyPapers(filters.ownerId);
    if ((mine as any).error) return mine as any;
    let rows = ((mine as any).data || []) as ResearchPaper[];
    // Apply server-like filters client-side
    if (options.dateFrom) rows = rows.filter(r => (r.issue_date || '') >= options.dateFrom!);
    if (options.dateTo) rows = rows.filter(r => (r.issue_date || '') <= options.dateTo!);
    if (filters.status) rows = rows.filter(r => r.status === filters.status);
    if (filters.year) {
      const y = Number(filters.year);
      rows = rows.filter(r => typeof r.issue_date === 'string' && r.issue_date?.startsWith(`${y}-`));
    }
    if (filters.q && filters.q.trim()) {
      const ql = filters.q.trim().toLowerCase();
      rows = rows.filter(r => {
        const inTitle = (r.title || '').toLowerCase().includes(ql);
        const inAuthors = (r.authors || []).some(a => (a || '').toLowerCase().includes(ql));
        const inKeywords = (r.keywords || []).some(k => (k || '').toLowerCase().includes(ql));
        const inAbstract = (r.abstract || '').toLowerCase().includes(ql);
        const inDept = (r.department || '').toLowerCase().includes(ql);
        const inStatus = (r.status || '').toLowerCase().includes(ql as any);
        return inTitle || inAuthors || inKeywords || inAbstract || inDept || inStatus;
      });
    }
    if (filters.keyword && filters.keyword.trim()) {
      const kw = filters.keyword.trim().toLowerCase();
      rows = rows.filter(r => (r.keywords || []).some(k => (k || '').toLowerCase().includes(kw)));
    }
    if (filters.department) {
      const dep = String(filters.department).toLowerCase();
      rows = rows.filter(r => String((r as any).department || (r as any).department_text || '').toLowerCase() === dep);
    }
    // Sort
    rows = rows.sort((a, b) => {
      const dir = ascending ? 1 : -1;
      const av = (a as any)[sortBy] || '';
      const bv = (b as any)[sortBy] || '';
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    const total = rows.length;
    const paged = rows.slice(from, to + 1);
    return { data: paged, count: total, error: null } as const;
  }

  // Map sortBy for SQL if needed
  const sqlSortCol = (() => {
    if (sortBy === 'publication_year') return 'issue_date'; // approximate by date
    if (sortBy === 'department') return 'department'; // some views expose department or department_text
    if (sortBy === 'authors') return undefined; // cannot order by array; will sort client-side
    return sortBy;
  })();

  let query = supabase.from(TABLE).select('*', { count: 'exact' });
  if (sqlSortCol) {
    query = query.order(sqlSortCol as any, { ascending, nullsFirst: !ascending });
  }

  // Department is derived (may not be a simple column); filter client-side below
  if (filters.year) {
    // Use date range on issue_date to be compatible with views without publication_year
    const y = Number(filters.year);
    const fromY = `${y}-01-01`;
    const toY = `${y}-12-31`;
    query = query.gte('issue_date', fromY).lte('issue_date', toY);
  }
  if (filters.status) query = query.eq('status', filters.status);
  // Owner is not available in the simple view; we'll ignore ownerId for this listing
  if (options.dateFrom) query = query.gte('issue_date', options.dateFrom);
  if (options.dateTo) query = query.lte('issue_date', options.dateTo);
  // Do NOT apply SQL filtering for q; we perform a broad client-side match across many fields below.
  // Pagination: when performing broad q search we fetch all then paginate client-side
  const broadSearch = !!(filters.q && filters.q.trim());
  if (!broadSearch && !wantAll && sortBy !== 'authors') {
    query = query.range(from, to);
  }

  // Keyword basic filter (client-side fallback below)
  const { data, error, count } = await query;
  if (error) return { error } as const;

  let rows = (data || []) as ResearchPaper[];
  // Normalize department field for view rows (some views may expose department_text)
  rows = rows.map((r: any) => ({
    ...r,
    department: r.department ?? r.department_text ?? null,
  }));
  // Exclude rows for disabled users (owner not active)
  try {
    const { data: activeUsers } = await supabase
      .from('users')
      .select('id')
      .eq('status', 'active');
    const activeSet = new Set((activeUsers || []).map((u: any) => u.id));
    rows = rows.filter(r => !r.owner || activeSet.has(r.owner));
  } catch {}
  // Client-side enrichment: match q against title, authors, keywords, abstract, department, status
  if (filters.q && filters.q.trim()) {
    const ql = filters.q.trim().toLowerCase();
    rows = rows.filter(r => {
      const inTitle = (r.title || '').toLowerCase().includes(ql);
      const inAuthors = (r.authors || []).some(a => (a || '').toLowerCase().includes(ql));
      const inKeywords = (r.keywords || []).some(k => (k || '').toLowerCase().includes(ql));
      const inAbstract = (r.abstract || '').toLowerCase().includes(ql);
      const inDept = (r.department || '').toLowerCase().includes(ql);
      const inStatus = (r.status || '').toLowerCase().includes(ql as any);
      return inTitle || inAuthors || inKeywords || inAbstract || inDept || inStatus;
    });
  }
  if (filters.keyword && filters.keyword.trim()) {
    const kw = filters.keyword.trim().toLowerCase();
    rows = rows.filter(r => (r.keywords || []).some(k => (k || '').toLowerCase().includes(kw)));
  }
  // Client-side department filter (if present)
  if (filters.department) {
    const dep = String(filters.department).toLowerCase();
    rows = rows.filter(r => {
      const d1 = (r as any).department || '';
      const d2 = (r as any).department_text || '';
      return String(d1 || d2).toLowerCase() === dep;
    });
  }

  // Further exclude rows where the document owner is disabled by looking up owners from documents table
  try {
    const ids = rows.map(r => r.id).filter(Boolean);
    if (ids.length > 0) {
      const docsRes = await supabase.from('documents').select('id, created_by').in('id', ids);
      const docs = (docsRes.data || []) as Array<{ id: string; created_by: string | null }>;
      const ownerIds = Array.from(new Set(docs.map(d => d.created_by).filter(Boolean) as string[]));
      if (ownerIds.length > 0) {
        const actRes = await supabase.from('users').select('id').in('id', ownerIds).eq('status', 'active');
        const activeSet = new Set(((actRes.data || []) as any[]).map(u => u.id));
        const byId = new Map(docs.map(d => [d.id, d.created_by] as const));
        rows = rows.filter(r => {
          const owner = byId.get(r.id);
          return !owner || activeSet.has(owner);
        });
      }
    }
  } catch {}

  // Client-side sorting for fields not reliably sortable in SQL
  if (sortBy === 'authors') {
    const dir = ascending ? 1 : -1;
    rows = rows.sort((a, b) => {
      const av = (a.authors || []).join(', ').toLowerCase();
      const bv = (b.authors || []).join(', ').toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }
  if (sortBy === 'department') {
    const dir = ascending ? 1 : -1;
    rows = rows.sort((a: any, b: any) => {
      const av = String(a.department || a.department_text || '').toLowerCase();
      const bv = String(b.department || b.department_text || '').toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  // Client-side pagination when broad search or when we fetched all to enable global sorting
  let total = count ?? rows.length;
  if (broadSearch || wantAll || sortBy === 'authors') {
    total = rows.length;
    rows = rows.slice(from, to + 1);
  }
  return { data: rows, count: total, error: null } as const;
}

export async function getPaper(id: string) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (error) return { error } as const;
  return { data: data as ResearchPaper } as const;
}

export type PaperPayload = {
  title: string;
  authors: string[];
  publication_year?: number | null;
  doi?: string | null;
  abstract?: string | null;
  department?: DepartmentType | null;
  keywords?: string[] | null;
  file_url?: string | null;
  co_author_ids?: string[] | null;
  status?: 'published' | 'under_review' | null;
  issue_date?: string | null; // ISO date string
};

export async function createPaper(payload: PaperPayload, ownerId: string) {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...payload, owner: ownerId });
  if (error) return { error } as const;
  // Best-effort audit without relying on return representation
  try {
    const insertedId = Array.isArray(data) && data[0]?.id ? (data[0] as any).id : undefined;
    await logAudit({ action: 'create', entity_type: 'paper', entity_id: insertedId || 'unknown', metadata: { ownerId } });
  } catch {}
  return { ok: true } as const;
}

export async function updatePaper(id: string, payload: Partial<PaperPayload>) {
  const { error } = await supabase
    .from(TABLE)
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error } as const;
  // Audit (best-effort)
  await logAudit({ action: 'update', entity_type: 'paper', entity_id: id, metadata: { fields: Object.keys(payload || {}) } });
  return { ok: true } as const;
}

export async function deletePaper(id: string) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) return { error } as const;
  // Audit (best-effort)
  await logAudit({ action: 'delete', entity_type: 'paper', entity_id: id });
  return { ok: true } as const;
}

export async function getMyPapers(ownerId: string) {
  // q1: owned documents
  const q1 = await supabase
    .from('documents')
    .select('*, authors:document_authors(*, user:users(id, full_name))')
    .eq('type_id', 'research_paper')
    .eq('created_by', ownerId)
    .order('created_at', { ascending: false });
  if (q1.error) return { error: q1.error } as const;
  const owned = q1.data || [];

  // q2: coauthored documents
  const da = await supabase
    .from('document_authors')
    .select('document_id')
    .eq('user_id', ownerId);
  if (da.error) return { error: da.error } as const;
  const docIds = Array.from(new Set((da.data || []).map((r: any) => r.document_id)));
  let coauthored: any[] = [];
  if (docIds.length > 0) {
    const q2 = await supabase
      .from('documents')
      .select('*, authors:document_authors(*, user:users(id, full_name))')
      .eq('type_id', 'research_paper')
      .in('id', docIds)
      .order('created_at', { ascending: false });
    if (q2.error) return { error: q2.error } as const;
    coauthored = q2.data || [];
  }

  // merge by id
  const byId = new Map<string, any>();
  [...owned, ...coauthored].forEach((d: any) => byId.set(d.id, d));
  const data = Array.from(byId.values());
  const rows = (data).map((d: any) => {
    const md = d.metadata || {};
    const authors = (d.authors || []).map((a: any) => a?.user?.full_name).filter(Boolean);
    const dept = md.department || null;
    const issue = md.issue_date || md.publication_date || null;
    const keywords = Array.isArray(md.keywords) ? md.keywords : [];
    return {
      id: d.id,
      owner: d.created_by,
      title: d.title,
      authors,
      abstract: md.abstract || null,
      department: dept,
      keywords,
      file_url: d.file_url,
      co_author_ids: (d.authors || []).filter((a: any) => !a.is_primary).map((a: any) => a.user_id),
      status: d.status,
      issue_date: issue,
      created_at: d.created_at,
      updated_at: d.updated_at,
    } as ResearchPaper;
  });
  return { data: rows as ResearchPaper[] } as const;
}
