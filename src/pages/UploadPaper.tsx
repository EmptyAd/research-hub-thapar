import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link, useLocation } from 'react-router-dom';
import SiteHeader from '@/components/layout/SiteHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// removed: type selection UI (now driven by header menu and URL param)
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DEPARTMENT_VALUES, getSessionUser, logout } from '@/utils/auth';
import { listDocumentTypes, createDocument, getDocument, updateDocument } from '@/utils/documents';
import type { DocumentType } from '@/types/database.types';
import { listProfessors, type Professor } from '@/utils/users';
import { FileUpload } from '@/components/research/FileUpload';
import { supabase } from '@/utils/supabaseClient';
import type { User } from '@supabase/supabase-js';

const UploadPaper = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getSessionUser();
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [params] = useSearchParams();
  const editId = params.get('edit');

  const [title, setTitle] = useState('');
  // Authors selection
  const [authorsManual, setAuthorsManual] = useState('');
  const [authorDialogOpen, setAuthorDialogOpen] = useState(false);
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [selectedProfessorIds, setSelectedProfessorIds] = useState<string[]>([]);
  const [abstract, setAbstract] = useState('');
  const [department, setDepartment] = useState<string>('');
  const [keywords, setKeywords] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [status, setStatus] = useState<'published' | 'under_review' | ''>('');
  const [patentStatus, setPatentStatus] = useState<'granted' | 'pending'>('pending');
  const [issueDate, setIssueDate] = useState<string>(''); // YYYY-MM-DD
  const [publicationYear, setPublicationYear] = useState<string>(''); // YYYY for research papers
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [docTypeId, setDocTypeId] = useState<string>('');
  // type selection is driven by URL (?type=...) and not shown as a control here
  const [dynamicMeta, setDynamicMeta] = useState<Record<string, any>>({});

  const onLogout = () => {
    logout();
    navigate('/login');
  };

  // Load Supabase auth user and listen for changes
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setAuthUser(data.user ?? null);
      setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setAuthUser(session?.user ?? null);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  // Do not auto-redirect; keep page accessible and handle auth on submit

  useEffect(() => {
    const typeName = types.find(t => t.id === docTypeId)?.name || 'Document';
    document.title = editId ? `Edit ${typeName} | ThaparAcad` : `Upload ${typeName} | ThaparAcad`;
  }, [editId, docTypeId, types]);

  useEffect(() => {
    async function loadProfessors() {
      const { data } = await listProfessors();
      if (data) setProfessors(data);
    }
    loadProfessors();
  }, []);

  useEffect(() => {
    async function loadTypes() {
      const t = await listDocumentTypes();
      setTypes(t);
      // If a type is provided in URL, preselect it
      const spType = params.get('type');
      if (spType && t.some(x => x.id === spType)) {
        setDocTypeId(spType);
      }
    }
    loadTypes();
  }, [editId, params]);

  // Default department to uploader's department (does not override if user changed it)
  useEffect(() => {
    if (!department && user?.department) {
      setDepartment(user.department);
    }
  }, [user, department]);

  useEffect(() => {
    const selected = types.find(t => t.id === docTypeId);
    if (!selected) return;
    const props = (selected.schema as any)?.properties || {};
    const init: Record<string, any> = {};
    Object.keys(props).forEach((k) => {
      const def: any = props[k] || {};
      if (def.type === 'array') init[k] = [];
      else if (def.type === 'boolean') init[k] = false;
      else init[k] = '';
    });
    setDynamicMeta(init);
  }, [docTypeId, types]);

  useEffect(() => {
    async function load() {
      if (!editId) return;
      const doc = await getDocument(editId);
      if (!doc) return;
      const data: any = doc;
      setTitle(data.title || '');
      const authors: any[] = data.authors || [];
      setSelectedProfessorIds(authors.filter(a => !a.is_primary).map(a => a.user_id));
      setAuthorsManual('');
      const md = data.metadata || {};
      setAbstract(md.abstract || '');
      setDepartment(md.department || '');
      const kws = Array.isArray(md.keywords) ? md.keywords : (typeof md.keywords === 'string' ? md.keywords.split(',').map((k:string)=>k.trim()).filter(Boolean) : []);
      setKeywords(kws.join(', '));
      setFileUrl(data.file_url || '');
      setPdfUrl(data.file_url || '');
      setStatus((data.status as any) || '');
      const dstr: string = md.issue_date || md.publication_date || '';
      setIssueDate(dstr);
      setPublicationYear(dstr ? String(dstr).slice(0,4) : '');
      setDocTypeId('research_paper');
    }
    load();
  }, [editId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Refresh Supabase auth on submit to avoid stale state
    let supaUid: string | undefined = authUser?.id;
    try {
      const { data } = await supabase.auth.getUser();
      supaUid = data?.user?.id || supaUid;
    } catch {}
    // Prefer Supabase auth user; fall back to legacy only for create
    const uid = supaUid || user?.id;
    // Editing requires Supabase-authenticated user due to RLS on documents
    if (editId && !supaUid) {
      setError('Please login (Supabase) to edit this document. Log out and log back in, then try again.');
      return;
    }
    if (!uid) {
      setError('Please login to upload.');
      return;
    }
    setLoading(true);
    setError(null);

    if (!title.trim()) {
      setLoading(false);
      setError('Title is required.');
      return;
    }
    if (docTypeId !== 'certificate' && !department) {
      setLoading(false);
      setError('Department is required.');
      return;
    }
    if (docTypeId === 'research_paper' && !status) {
      setLoading(false);
      setError('Status is required.');
      return;
    }
    // Validate date/year depending on type
    if (docTypeId === 'research_paper') {
      if (!publicationYear || !/^\d{4}$/.test(publicationYear)) {
        setLoading(false);
        setError('Publication year is required (YYYY).');
        return;
      }
    } else {
      if (!issueDate) {
        setLoading(false);
        setError('Date of Issue is required.');
        return;
      }
    }
    // Validate optional File URL if provided
    if (fileUrl) {
      try {
        const u = new URL(fileUrl);
        if (!/^https?:$/.test(u.protocol)) throw new Error('invalid');
      } catch {
        setLoading(false);
        setError('Please provide a valid File URL (https://...)');
        return;
      }
    }

    // Block submit if file is still uploading
    if (pdfUploading) {
      setLoading(false);
      setError('Please wait for the PDF to finish uploading.');
      return;
    }

    // Require either uploaded PDF or a valid File URL
    if (!pdfUrl && !fileUrl) {
      setLoading(false);
      setError('Please upload a PDF or provide a valid File URL.');
      return;
    }

    if (!docTypeId) {
      setLoading(false);
      setError('Please select a document type.');
      return;
    }

    const selectedNames = professors
      .filter(p => selectedProfessorIds.includes(p.id))
      .map(p => p.full_name);
    const manualNames = authorsManual.split(',').map(a => a.trim()).filter(Boolean);
    // Ensure uploader is the main author by default (first in list)
    const withUploaderFirst = [
      (authUser?.user_metadata as any)?.full_name || user?.full_name || 'Me',
      ...selectedNames,
      ...manualNames,
    ];
    const seen = new Set<string>();
    const combinedAuthors = withUploaderFirst.filter((name) => {
      const key = (name || '').trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const isRP = docTypeId === 'research_paper';

    const meta = { ...dynamicMeta };
    const selectedType = types.find(t => t.id === docTypeId);
    if (selectedType && selectedType.schema) {
      const props: any = selectedType.schema.properties || {};
      Object.keys(props).forEach((k) => {
        const def: any = props[k] || {};
        if (def.type === 'array' && typeof meta[k] === 'string') {
          meta[k] = String(meta[k]).split(',').map((v: string) => v.trim()).filter(Boolean);
        }
      });
    }

    // Map UI status to storage status
    const submitStatus = docTypeId === 'certificate'
      ? 'published'
      : (docTypeId === 'patent'
        ? (patentStatus === 'granted' ? 'published' : 'under_review')
        : ((status as any) || 'under_review'));

    // Build metadata for research_paper with year-only date
    if (docTypeId === 'research_paper') {
      meta.abstract = abstract || null;
      if (department) meta.department = department;
      const kwArr = keywords.split(',').map(k=>k.trim()).filter(Boolean);
      if (kwArr.length) meta.keywords = kwArr;
      if (publicationYear) meta.issue_date = `${publicationYear}-01-01`;
    }

    const input = {
      type_id: docTypeId,
      title: title.trim(),
      description: null,
      file_url: pdfUrl || fileUrl || null,
      status: submitStatus as any,
      metadata: meta,
      authors: [
        { user_id: (editId ? supaUid : uid)!, is_primary: true, order: 0, role: 'author' },
        ...selectedProfessorIds.map((id, idx) => ({ user_id: id, is_primary: false, order: idx + 1, role: 'author' }))
      ]
    } as const;

    try {
      if (editId) {
        await updateDocument(editId, { 
          id: editId,
          title: input.title,
          file_url: input.file_url as any,
          status: input.status as any,
          metadata: input.metadata as any,
          authors: input.authors as any,
        }, supaUid!);
      } else {
        await createDocument(input as any, uid);
      }
      setLoading(false);
      navigate('/dashboard');
    } catch (e: any) {
      setLoading(false);
      setError(e?.message ?? 'Failed to save');
    }
  };

  return (
    <>
      <SiteHeader />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-6">{(() => {
          const typeName = types.find(t => t.id === docTypeId)?.name || 'Document';
          return editId ? `Edit ${typeName}` : `Upload ${typeName}`;
        })()}</h1>
      <form onSubmit={onSubmit} className="space-y-8">
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          {/* Document Type selection hidden: chosen via header Create menu routing (?type=...) */}
        </section>

        {docTypeId !== 'certificate' && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Authors</h2>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {professors.filter(p => selectedProfessorIds.includes(p.id)).map((p) => (
                <span key={p.id} className="inline-flex items-center gap-2 rounded border px-2 py-1 text-sm">
                  {p.full_name}
                  <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setSelectedProfessorIds(prev => prev.filter(id => id !== p.id))}>×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setAuthorDialogOpen(true)}>Select Professors</Button>
            </div>
            <div>
              <Label htmlFor="authorsManual">Other authors (comma separated)</Label>
              <Input id="authorsManual" placeholder="Enter names not found in list" value={authorsManual} onChange={(e) => setAuthorsManual(e.target.value)} />
            </div>
          </div>
        </section>
        )}

        {/* Publication Year field removed. Year will be derived from Date of Issue. */}

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Meta Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {docTypeId !== 'certificate' && (
              <div>
                <Label htmlFor="dept">Department</Label>
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger id="dept">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENT_VALUES.map((d) => (
                      <SelectItem key={d} value={d}>{d.toUpperCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {docTypeId !== 'certificate' && (
              <div>
                <Label htmlFor="status">Status</Label>
                {docTypeId === 'patent' ? (
                  <Select value={patentStatus} onValueChange={(v) => setPatentStatus(v as any)}>
                    <SelectTrigger id="status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="granted">Granted</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                    <SelectTrigger id="status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="published">Published</SelectItem>
                      <SelectItem value="under_review">Under Review</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
            {docTypeId === 'research_paper' ? (
              <div>
                <Label htmlFor="pub_year">Publication Year</Label>
                <Input id="pub_year" type="number" inputMode="numeric" pattern="\\d{4}" min="1900" max="2100" placeholder="YYYY" value={publicationYear} onChange={(e) => setPublicationYear(e.target.value)} required />
              </div>
            ) : (
              <div>
                <Label htmlFor="issue_date">Date of Issue</Label>
                <Input id="issue_date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
              </div>
            )}
            {(docTypeId === 'research_paper') && (
              <div className="md:col-span-2">
                <Label htmlFor="abstract">Abstract</Label>
                <Textarea id="abstract" rows={4} value={abstract} onChange={(e) => setAbstract(e.target.value)} />
              </div>
            )}
            {(docTypeId === 'research_paper') && (
              <div className="md:col-span-2">
                <Label htmlFor="keywords">Keywords (comma separated)</Label>
                <Input id="keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Publication Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <Label htmlFor="file">File URL (optional)</Label>
              <Input id="file" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://..." />
            </div>
            {docTypeId && docTypeId !== 'research_paper' && (
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            {(() => {
              const selected = types.find(t => t.id === docTypeId);
              const props: any = (selected?.schema as any)?.properties || {};
              return Object.keys(props).map((key) => {
                const def: any = props[key] || {};
                const val = dynamicMeta[key] ?? '';
                if (def.type === 'boolean') {
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <input id={`meta_${key}`} type="checkbox" checked={!!val} onChange={(e) => setDynamicMeta(prev => ({ ...prev, [key]: e.target.checked }))} />
                      <Label htmlFor={`meta_${key}`}>{def.title || key}</Label>
                    </div>
                  );
                }
                if (def.type === 'array') {
                  return (
                    <div key={key} className="md:col-span-2">
                      <Label htmlFor={`meta_${key}`}>{def.title || key} (comma separated)</Label>
                      <Input id={`meta_${key}`} value={Array.isArray(val) ? val.join(', ') : val}
                        onChange={(e) => setDynamicMeta(prev => ({ ...prev, [key]: e.target.value }))} />
                    </div>
                  );
                }
                const isDate = def.format === 'date';
                return (
                  <div key={key}>
                    <Label htmlFor={`meta_${key}`}>{def.title || key}</Label>
                    <Input id={`meta_${key}`} type={isDate ? 'date' : 'text'} value={val}
                      onChange={(e) => setDynamicMeta(prev => ({ ...prev, [key]: e.target.value }))} />
                  </div>
                );
              });
            })()}
          </div>
        )}
          <div className="md:col-span-2">
            <FileUpload
              onFileUpload={(url) => { setPdfUrl(url); setError(null); }}
              onUploadingChange={setPdfUploading}
            />
          </div>
          </div>
        </section>

        {error && <p className="text-sm text-red-600 md:col-span-2">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={loading || pdfUploading}>{editId ? 'Save Changes' : 'Create'}</Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/dashboard')}>Cancel</Button>
        </div>
      </form>

      <CommandDialog open={authorDialogOpen} onOpenChange={setAuthorDialogOpen}>
        <DialogTitle className="sr-only">Select Professors</DialogTitle>
        <DialogDescription className="sr-only">Search and select co-authors from the list</DialogDescription>
        <CommandInput placeholder="Search professors..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Professors">
            {professors.map((p) => {
              const selected = selectedProfessorIds.includes(p.id);
              return (
                <CommandItem key={p.id} onSelect={() => {
                  setSelectedProfessorIds(prev => selected ? prev.filter(id => id !== p.id) : [...prev, p.id]);
                }}>
                  <span className={selected ? 'font-medium' : ''}>{p.full_name}</span>
                  {selected && <span className="ml-auto text-xs text-muted-foreground">Selected</span>}

                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      </main>
    </>
  );
};

export default UploadPaper;
