import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { useToast } from '@/hooks/use-toast';
import type { ResearchPaper } from '@/components/research/ResearchCard';
import { getSessionUser } from '@/utils/auth';
import { createDocument } from '@/utils/documents';

export interface DatabasePaper {
  id: string;
  owner: string;
  title: string;
  paper_number: string;
  collaborators: string[];
  issue_date: string;
  publish_date?: string;
  status: 'published' | 'under_review' | 'draft';
  keywords: string[];
  pdf_url?: string;
  pdf_path?: string;
  department?: string;
  co_author_ids?: string[];
  created_at: string;
  updated_at: string;
  co_authors?: Array<{
    id: string;
    full_name: string;
    department: string;
  }>;
}

export const useResearchPapers = () => {
  const [papers, setPapers] = useState<ResearchPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const transformPaper = (dbPaper: DatabasePaper): ResearchPaper => ({
    id: dbPaper.id,
    paperNumber: dbPaper.paper_number,
    title: dbPaper.title,
    collaborators: dbPaper.collaborators,
    date: dbPaper.issue_date,
    publishDate: dbPaper.publish_date,
    status: (dbPaper.status === 'under_review' ? 'in-review' : dbPaper.status) as any,
    keywords: dbPaper.keywords,
    pdfUrl: dbPaper.pdf_url,
    owner: dbPaper.owner,
    department: dbPaper.department,
    coAuthorIds: dbPaper.co_author_ids,
    coAuthors: dbPaper.co_authors
  });

  const fetchPapers = async () => {
    console.log('Fetching papers...');
    setLoading(true);
    
    try {
      const sessionUser = getSessionUser();
      if (sessionUser?.id) {
        // Logged-in: split into two queries to avoid OR across related table path
        // q1: owned or published
        const q1 = await supabase
          .from('documents')
          .select('*, authors:document_authors(*, user:users(id, full_name, department))')
          .eq('type_id', 'research_paper')
          .or(`created_by.eq.${sessionUser.id},status.eq.published`)
          .order('created_at', { ascending: false });
        if (q1.error) throw q1.error;
        const ownedOrPublished = q1.data || [];

        // q2: documents where user is a co-author
        const da = await supabase
          .from('document_authors')
          .select('document_id')
          .eq('user_id', sessionUser.id);
        if (da.error) throw da.error;
        const docIds = Array.from(new Set((da.data || []).map((r: any) => r.document_id)));
        let coauthored: any[] = [];
        if (docIds.length > 0) {
          const q2 = await supabase
            .from('documents')
            .select('*, authors:document_authors(*, user:users(id, full_name, department))')
            .eq('type_id', 'research_paper')
            .in('id', docIds)
            .order('created_at', { ascending: false });
          if (q2.error) throw q2.error;
          coauthored = q2.data || [];
        }

        // merge and de-duplicate by id
        const byId = new Map<string, any>();
        [...ownedOrPublished, ...coauthored].forEach((d: any) => byId.set(d.id, d));
        const data = Array.from(byId.values());
        console.log('Papers data:', data);
        const mapped: DatabasePaper[] = (data).map((d: any) => {
          const md = d.metadata || {};
          const coAuthors = (d.authors || []).filter((a: any) => !a.is_primary).map((a: any) => a.user_id);
          const coAuthorDetails = (d.authors || []).filter((a: any) => !a.is_primary).map((a: any) => ({
            id: a.user_id,
            full_name: a.user?.full_name,
            department: a.user?.department,
          }));
          const collaborators = (d.authors || []).map((a: any) => a.user?.full_name).filter(Boolean);
          return {
            id: d.id,
            owner: d.created_by,
            title: d.title,
            paper_number: '',
            collaborators,
            issue_date: (md.issue_date || md.publication_date || d.created_at || '').slice(0,10),
            publish_date: undefined,
            status: d.status,
            keywords: Array.isArray(md.keywords) ? md.keywords : [],
            pdf_url: d.file_url,
            pdf_path: undefined,
            department: md.department,
            co_author_ids: coAuthors,
            created_at: d.created_at,
            updated_at: d.updated_at,
            co_authors: coAuthorDetails,
          } as DatabasePaper;
        });
        const transformedPapers = mapped.map(transformPaper);
        setPapers(transformedPapers);
      } else {
        // Logged-out: read published-only from research_papers_simple
        const { data, error } = await supabase
          .from('research_papers_simple')
          .select('*')
          .eq('status', 'published')
          .order('created_at', { ascending: false });
        console.log('Papers data:', data);
        console.log('Papers error:', error);
        if (error) throw error;
        const mapped: DatabasePaper[] = (data || []).map((r: any) => ({
          id: r.id,
          owner: '',
          title: r.title,
          paper_number: '',
          collaborators: (r.authors || []),
          issue_date: (r.issue_date || '').slice(0,10),
          publish_date: undefined,
          status: r.status,
          keywords: [],
          pdf_url: r.file_url,
          pdf_path: undefined,
          department: (r.department_text || null),
          co_author_ids: [],
          created_at: r.created_at,
          updated_at: r.updated_at,
          co_authors: [],
        }));
        const transformedPapers = mapped.map(transformPaper);
        setPapers(transformedPapers);
      }
    } catch (error: any) {
      console.error('Papers fetch error:', error);
      toast({
        title: "Failed to load papers",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const createPaper = async (paperData: Omit<ResearchPaper, 'id' | 'owner'>) => {
    const sessionUser = getSessionUser();
    if (!sessionUser) {
      toast({
        title: "Authentication required",
        description: "Please log in to upload papers.",
        variant: "destructive"
      });
      return null;
    }

    try {
      // Create via documents API
      const input = {
        type_id: 'research_paper',
        title: paperData.title,
        description: null,
        file_url: paperData.pdfUrl || null,
        status: (paperData.status as any) || 'under_review',
        metadata: {
          abstract: '',
          department: paperData.department || null,
          keywords: paperData.keywords || [],
          issue_date: (paperData.date ? `${String(paperData.date).slice(0,4)}-01-01` : null),
        },
        authors: [
          { user_id: sessionUser.id, is_primary: true, order: 0, role: 'author' },
          ...(paperData.coAuthorIds || []).map((id, idx) => ({ user_id: id, is_primary: false, order: idx + 1, role: 'author' }))
        ],
      } as const;
      const doc = await createDocument(input as any, sessionUser.id);
      // Map to ResearchPaper card shape minimally
      toast({ title: 'Paper uploaded', description: 'Your research paper has been successfully uploaded.' });
      // Refresh list to include the new item
      await fetchPapers();
      return null;
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive"
      });
      return null;
    }
  };

  const uploadFile = async (file: File) => {
    const sessionUser = getSessionUser();
    if (!sessionUser) throw new Error('User must be authenticated to upload files');

    const fileExt = file.name.split('.').pop();
    const fileName = `${sessionUser.id}/${Date.now()}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('papers')
      .upload(fileName, file);

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('papers')
      .getPublicUrl(data.path);

    return publicUrl;
  };

  useEffect(() => {
    fetchPapers();
  }, []);

  return {
    papers,
    loading,
    createPaper,
    uploadFile,
    refreshPapers: fetchPapers
  };
};