import { useEffect, useMemo, useRef, useState } from 'react';
import { getSessionUser, logout, SESSION_CHANGE_EVENT, changePassword } from '@/utils/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { getMyPapers, listPapers, deletePaper, type ResearchPaper } from '@/utils/research';
import { updateDocument, deleteDocument } from '@/utils/documents';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, SlidersHorizontal, Bell, User as UserIcon, Settings, Plus, FileText, ScrollText, Award, Mic, Eye, Pencil, Trash, File as DocumentIcon } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/utils/supabaseClient';
import { updateUserProfile, getUserRole } from '@/utils/users';
import { DEPARTMENT_VALUES } from '@/utils/auth';
import SiteHeader from '@/components/layout/SiteHeader';

const Dashboard = () => {
  const [user, setUser] = useState(getSessionUser());
  const navigate = useNavigate();
  const [papers, setPapers] = useState<ResearchPaper[]>([]);
  const [sortBy, setSortBy] = useState<'index'|'title'|'authors'|'department'|'status'|'year'>('title');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Header search UI state (used to navigate to Home search)
  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [department, setDepartment] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [pfName, setPfName] = useState('');
  const [pfDept, setPfDept] = useState<string>('');
  const [pfAvatarFile, setPfAvatarFile] = useState<File | null>(null);
  const [pfSaving, setPfSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cpOpen, setCpOpen] = useState(false);
  const [cpCurrent, setCpCurrent] = useState('');
  const [cpNew, setCpNew] = useState('');
  const [cpConfirm, setCpConfirm] = useState('');
  const [cpLoading, setCpLoading] = useState(false);
  const [cpMsg, setCpMsg] = useState<string | null>(null);
  const [role, setRole] = useState<string | undefined>(undefined);
  const [docStats, setDocStats] = useState({ papers: 0, patents: 0, certificates: 0, conferences: 0 });
  const [activeTab, setActiveTab] = useState<'about' | 'papers' | 'patents' | 'certificates' | 'conferences' | 'insights'>('about');
  const [patents, setPatents] = useState<any[]>([]);
  const [certificates, setCertificates] = useState<any[]>([]);
  const [conferences, setConferences] = useState<any[]>([]);
  const [userAbout, setUserAbout] = useState<string>('');
  const [pfAbout, setPfAbout] = useState<string>('');
  const [editOpen, setEditOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<any | null>(null);
  const [edTitle, setEdTitle] = useState('');
  const [edDate, setEdDate] = useState('');
  const [edVenue, setEdVenue] = useState('');
  const [edStatus, setEdStatus] = useState<'under_review'|'published'>('under_review');
  const [edFile, setEdFile] = useState('');
  const [edSaving, setEdSaving] = useState(false);
  const location = useLocation();
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    if (sp.get('settings') === 'profile') {
      setPfName(user?.full_name || '');
      setPfDept(user?.department || '');
      setPfAbout(userAbout);
      setProfileOpen(true);
    }
  }, [location.search]);

  const reqIdRef = useRef(0);

  useEffect(() => {
    const onSession = () => setUser(getSessionUser());
    window.addEventListener(SESSION_CHANGE_EVENT, onSession as any);
    window.addEventListener('storage', onSession);
    return () => {
      window.removeEventListener(SESSION_CHANGE_EVENT, onSession as any);
      window.removeEventListener('storage', onSession);
    };
  }, []);

  const getYear = (p: ResearchPaper) => {
    if (typeof p.publication_year === 'number') return p.publication_year;
    if (p.issue_date && typeof p.issue_date === 'string' && p.issue_date.length >= 4) return Number(p.issue_date.slice(0,4));
    return undefined;
  };

  const toggleSort = (field: 'index'|'title'|'authors'|'department'|'status'|'year') => {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const sortedPapers = useMemo(() => {
    const arr = [...papers];
    const dir = sortDir === 'asc' ? 1 : -1;
    return arr.sort((a,b) => {
      const ai = papers.indexOf(a) + 1;
      const bi = papers.indexOf(b) + 1;
      let av: any; let bv: any;
      switch (sortBy) {
        case 'index': av = ai; bv = bi; break;
        case 'title': av = (a.title||'').toLowerCase(); bv = (b.title||'').toLowerCase(); break;
        case 'authors': av = (a.authors||[]).join(', ').toLowerCase(); bv = (b.authors||[]).join(', ').toLowerCase(); break;
        case 'department': av = ((a.department||'') as string).toLowerCase(); bv = ((b.department||'') as string).toLowerCase(); break;
        case 'status': av = (a.status||''); bv = (b.status||''); break;
        case 'year': av = getYear(a) ?? -Infinity; bv = getYear(b) ?? -Infinity; break;
        default: av = 0; bv = 0;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [papers, sortBy, sortDir]);

  useEffect(() => {
    async function loadRole() {
      if (!user?.id) { setRole(undefined); setUserAbout(''); return; }
      const { role } = await getUserRole(user.id);
      setRole(role);
      try {
        // Select all to avoid 400 when specific columns are missing in the schema
        const { data: u } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
        const spec = (u as any)?.specialization as string | null | undefined;
        const legacy = (u as any)?.about as string | null | undefined;
        setUserAbout((spec && spec.trim()) ? spec : (legacy || ''));
      } catch {}
    }
    loadRole();
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    async function load() {
      const myReq = ++reqIdRef.current;
      setLoading(true);
      try {
        if (!user) {
          if (active) {
            setPapers([]);
            setErrorMsg(null);
            setDocStats({ papers: 0, patents: 0, certificates: 0, conferences: 0 });
          }
          return;
        }
        // Use owner OR co-author visibility for "My Papers" to avoid owner-id mismatch issues
        const { data, error } = await getMyPapers(user.id);
        if (error) {
          setErrorMsg((error as any)?.message || 'Failed to load your papers');
          setPapers([]);
        } else if (active && data) {
          setErrorMsg(null);
          setPapers(data);
        }

        // Fetch counts for other document types (owned by the user)
        try {
          const ownerId = user.id;
          const [pat, cert, conf, patList, certList, confList] = await Promise.all([
            supabase.from('documents').select('id', { count: 'exact', head: true }).eq('type_id', 'patent').eq('created_by', ownerId),
            supabase.from('documents').select('id', { count: 'exact', head: true }).eq('type_id', 'certificate').eq('created_by', ownerId),
            supabase.from('documents').select('id', { count: 'exact', head: true }).eq('type_id', 'conference_paper').eq('created_by', ownerId),
            supabase.from('documents').select('*').eq('type_id', 'patent').eq('created_by', ownerId).order('created_at', { ascending: false }),
            supabase.from('documents').select('*').eq('type_id', 'certificate').eq('created_by', ownerId).order('created_at', { ascending: false }),
            supabase.from('documents').select('*').eq('type_id', 'conference_paper').eq('created_by', ownerId).order('created_at', { ascending: false }),
          ]);
          const papersCount = (data || []).length;
          const patentsCount = pat.count || 0;
          const certificatesCount = cert.count || 0;
          const conferencesCount = conf.count || 0;
          if (active) {
            setDocStats({ papers: papersCount, patents: patentsCount, certificates: certificatesCount, conferences: conferencesCount });
            setPatents((patList.data as any[]) || []);
            setCertificates((certList.data as any[]) || []);
            setConferences((confList.data as any[]) || []);
          }
        } catch {}
      } finally {
        if (reqIdRef.current === myReq) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [user?.id]);

  const goToGlobalSearch = () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (department) params.set('department', department);
    if (status) params.set('status', status);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    navigate(params.toString() ? `/?${params.toString()}` : '/');
  };

  // Decide preview embedding strategy for a given URL
  const computePreviewSrc = (url: string | null) => {
    if (!url) return null;
    const lower = url.toLowerCase();
    if (lower.endsWith('.pdf')) {
      return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`;
    }
    return null;
  };

  const onLogout = () => {
    logout();
    navigate('/login');
  };

  const onDelete = async (id: string) => {
    if (!confirm('Delete this paper?')) return;
    const { error } = await deletePaper(id);
    if (!error) setPapers(prev => prev.filter(p => p.id !== id));
  };

  return (
    <>
      <SiteHeader />
      

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Top Welcome + Stats */}
        <section className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm p-6 flex items-center gap-6">
            <div className="w-16 h-16 rounded-full bg-muted shadow" />
            <div className="flex-1">
              <h1 className="text-2xl font-semibold">Welcome, {user?.full_name || 'Guest'}!</h1>
              <p className="text-sm text-muted-foreground">Jump back in, or start something new.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border bg-card p-5 flex items-start gap-3">
              <FileText className="h-5 w-5 mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Research Paper</p>
                <p className="text-2xl font-semibold">{docStats.papers}</p>
                <p className="text-xs text-muted-foreground">total created</p>
              </div>
            </div>
            <div className="rounded-xl border bg-card p-5 flex items-start gap-3">
              <ScrollText className="h-5 w-5 mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Patents</p>
                <p className="text-2xl font-semibold">{docStats.patents}</p>
                <p className="text-xs text-muted-foreground">total created</p>
              </div>
            </div>
            <div className="rounded-xl border bg-card p-5 flex items-start gap-3">
              <Award className="h-5 w-5 mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Certificates</p>
                <p className="text-2xl font-semibold">{docStats.certificates}</p>
                <p className="text-xs text-muted-foreground">total created</p>
              </div>
            </div>
            <div className="rounded-xl border bg-card p-5 flex items-start gap-3">
              <Mic className="h-5 w-5 mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Conference</p>
                <p className="text-2xl font-semibold">{docStats.conferences}</p>
                <p className="text-xs text-muted-foreground">total posted</p>
              </div>
            </div>
          </div>
        </section>

        {/* Tabs */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
  <div className="flex gap-2">
            {([
              { key: 'about', label: 'About' },
              { key: 'papers', label: 'Research Paper' },
              { key: 'patents', label: 'Patents' },
              { key: 'certificates', label: 'Certificates' },
              { key: 'conferences', label: 'Conference' },
            ] as const).map((t) => (
              <button
                key={t.key}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${activeTab===t.key ? 'bg-blue-100 text-blue-700' : 'text-muted-foreground hover:bg-gray-100'}`}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
              </button>
            ))}
            
          
  </div>
  {activeTab !== 'about' && (
    <Button
      onClick={() => {
        const type =
          activeTab === 'papers' ? 'research_paper' :
          activeTab === 'patents' ? 'patent' :
          activeTab === 'certificates' ? 'certificate' :
          'conference_paper';
        navigate(`/upload?type=${type}`);
      }}
    >
      {activeTab === 'papers' && '+ Upload Research Paper'}
      {activeTab === 'patents' && '+ Upload Patent'}
      {activeTab === 'certificates' && '+ Upload Certificate'}
      {activeTab === 'conferences' && '+ Upload Conference'}
    </Button>
  )}
</div>

          {/* About */}
          {activeTab === 'about' && (
            <div className="space-y-2">
              {userAbout ? (
                <p className="text-sm leading-6 whitespace-pre-wrap">{userAbout}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Add an “About Me” in Profile to show it here.</p>
              )}
            </div>
          )}

          {/* Research Papers table (existing) */}
          {activeTab === 'papers' && (
            <section className="space-y-3">
              <h2 className="text-xl font-semibold">My Papers</h2>
              {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
              {loading && papers.length === 0 ? (
                <div className="rounded-md border p-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="animate-pulse bg-gray-200 h-6 w-6 rounded" />
                        <div className="animate-pulse bg-gray-200 h-6 w-48 rounded" />
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="animate-pulse bg-gray-200 h-6 w-24 rounded" />
                        <div className="animate-pulse bg-gray-200 h-6 w-24 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : papers.length === 0 ? (
                <div className="rounded-md border p-10 text-center text-muted-foreground">
                  <div className="text-3xl mb-2">📄</div>
                  <p>No research papers available.</p>
                  <p className="text-sm">Click “Create” to add your first entry.</p>
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="cursor-pointer select-none" onClick={()=>toggleSort('index')}>Index {sortBy==='index' ? (sortDir==='asc'?'↑':'↓') : ''}</TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={()=>toggleSort('title')}>Title {sortBy==='title' ? (sortDir==='asc'?'↑':'↓') : ''}</TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={()=>toggleSort('authors')}>Authors {sortBy==='authors' ? (sortDir==='asc'?'↑':'↓') : ''}</TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={()=>toggleSort('department')}>Department {sortBy==='department' ? (sortDir==='asc'?'↑':'↓') : ''}</TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={()=>toggleSort('status')}>Status {sortBy==='status' ? (sortDir==='asc'?'↑':'↓') : ''}</TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={()=>toggleSort('year')}>Year {sortBy==='year' ? (sortDir==='asc'?'↑':'↓') : ''}</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedPapers.map((p, idx) => (
                        <TableRow key={p.id} className="hover:bg-gray-50 transition h-14">
                          <TableCell className="font-medium w-16">{idx+1}</TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <DocumentIcon className="w-5 h-5 text-gray-500" />
                              <span>{p.title}</span>
                            </div>
                          </TableCell>
                          <TableCell className="align-middle text-sm text-muted-foreground">{(p.authors || []).join(', ')}</TableCell>
                          <TableCell className="align-middle text-sm text-muted-foreground">{(p.department || '').toUpperCase() || '-'}</TableCell>
                          <TableCell className="align-middle text-sm text-muted-foreground">{p.status ? (p.status === 'published' ? 'Published' : 'Under Review') : '-'}</TableCell>
                          <TableCell className="align-middle text-sm text-muted-foreground">{getYear(p) ?? '-'}</TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-2">
                              {p.file_url?.toLowerCase().endsWith('.pdf') && (
                                <Eye
                                  className="w-5 h-5 cursor-pointer text-gray-600 hover:text-blue-600"
                                  onClick={() => { if (p.file_url) window.open(p.file_url, '_blank', 'noopener'); }}
                                />
                              )}
                              <Pencil className="w-5 h-5 cursor-pointer text-gray-600 hover:text-green-600" onClick={() => navigate(`/upload?edit=${p.id}`)} />
                              <Trash className="w-5 h-5 cursor-pointer text-red-500 hover:text-red-700" onClick={() => onDelete(p.id)} />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          )}

          {/* Patents list */}
          {activeTab === 'patents' && (
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">My Patents</h2>
              {loading && patents.length === 0 ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : patents.length === 0 ? (
                <p className="text-muted-foreground">No patents yet.</p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Publication Date</TableHead>
                        <TableHead>File</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {patents.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">{d.title}</TableCell>
                          <TableCell>{d.status === 'published' ? 'Granted' : 'Pending'}</TableCell>
                          <TableCell>{(d.metadata?.publication_date as string) || '-'}</TableCell>
                          <TableCell>{d.file_url ? <a className="text-primary" href={d.file_url} target="_blank">Open</a> : '-'}</TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-2">
                              <Pencil className="w-5 h-5 cursor-pointer text-gray-600 hover:text-green-600" onClick={()=>{ setEditingDoc(d); setEdTitle(d.title || ''); setEdDate((d.metadata?.publication_date as string) || ''); setEdVenue(''); setEdStatus(d.status || 'under_review'); setEdFile(d.file_url || ''); setEditOpen(true); }} />
                              <Trash className="w-5 h-5 cursor-pointer text-red-500 hover:text-red-700" onClick={async ()=>{ if(!user?.id) return; if(!confirm('Delete this patent?')) return; await deleteDocument(d.id, user.id); setPatents(prev=> prev.filter(x=>x.id!==d.id)); }} />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {/* Certificates list */}
          {activeTab === 'certificates' && (
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">My Certificates</h2>
              {loading && certificates.length === 0 ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : certificates.length === 0 ? (
                <p className="text-muted-foreground">No certificates yet.</p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Issued On</TableHead>
                        <TableHead>File</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {certificates.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">{d.title}</TableCell>
                          <TableCell>{(d.metadata?.issue_date as string) || (d.metadata?.publication_date as string) || '-'}</TableCell>
                          <TableCell>{d.file_url ? <a className="text-primary" href={d.file_url} target="_blank">Open</a> : '-'}</TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-2">
                              <Pencil className="w-5 h-5 cursor-pointer text-gray-600 hover:text-green-600" onClick={()=>{ setEditingDoc(d); setEdTitle(d.title || ''); setEdDate((d.metadata?.issue_date as string) || (d.metadata?.publication_date as string) || ''); setEdVenue(''); setEdStatus(d.status || 'published'); setEdFile(d.file_url || ''); setEditOpen(true); }} />
                              <Trash className="w-5 h-5 cursor-pointer text-red-500 hover:text-red-700" onClick={async ()=>{ if(!user?.id) return; if(!confirm('Delete this certificate?')) return; await deleteDocument(d.id, user.id); setCertificates(prev=> prev.filter(x=>x.id!==d.id)); }} />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {/* Conference list */}
          {activeTab === 'conferences' && (
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">My Conference Papers</h2>
              {loading && conferences.length === 0 ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : conferences.length === 0 ? (
                <p className="text-muted-foreground">No conference papers yet.</p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Venue</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>File</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {conferences.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">{d.title}</TableCell>
                          <TableCell>{(d.metadata?.conference_name as string) || '-'}</TableCell>
                          <TableCell>{(d.metadata?.publication_date as string) || '-'}</TableCell>
                          <TableCell>{d.file_url ? <a className="text-primary" href={d.file_url} target="_blank">Open</a> : '-'}</TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-2">
                              <Pencil className="w-5 h-5 cursor-pointer text-gray-600 hover:text-green-600" onClick={()=>{ setEditingDoc(d); setEdTitle(d.title || ''); setEdDate((d.metadata?.publication_date as string) || ''); setEdVenue((d.metadata?.conference_name as string) || ''); setEdStatus(d.status || 'under_review'); setEdFile(d.file_url || ''); setEditOpen(true); }} />
                              <Trash className="w-5 h-5 cursor-pointer text-red-500 hover:text-red-700" onClick={async ()=>{ if(!user?.id) return; if(!confirm('Delete this conference document?')) return; await deleteDocument(d.id, user.id); setConferences(prev=> prev.filter(x=>x.id!==d.id)); }} />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </section>
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label htmlFor="dept">Department</Label>
              <Select value={department} onValueChange={(v) => setDepartment(v === 'any' ? '' : v)}>
                <SelectTrigger id="dept">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {DEPARTMENT_VALUES.map((d) => (
                    <SelectItem key={d} value={d}>{d.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v === 'any' ? '' : v)}>
                <SelectTrigger id="status">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="under_review">Under Review</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="from">Date of Issue (From)</Label>
              <Input id="from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="to">Date of Issue (To)</Label>
              <Input id="to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        )}
      </main>

      {/* Profile dialog */}
      <Dialog
        open={profileOpen}
        onOpenChange={(open)=>{
          setProfileOpen(open);
          if (!open) {
            const sp = new URLSearchParams(location.search);
            if (sp.get('settings') === 'profile') {
              sp.delete('settings');
              navigate({ pathname: location.pathname, search: sp.toString() }, { replace: true });
            }
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="pf_name">Full name</Label>
              <Input id="pf_name" value={pfName} onChange={(e)=>setPfName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pf_dept">Department</Label>
              <Select value={pfDept || ''} onValueChange={setPfDept}>
                <SelectTrigger id="pf_dept">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENT_VALUES.map((d) => (
                    <SelectItem key={d} value={d}>{d.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pf_about">About Me</Label>
              <Textarea id="pf_about" rows={4} value={pfAbout} onChange={(e)=>setPfAbout(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pf_avatar">Avatar</Label>
              <Input id="pf_avatar" type="file" accept="image/*" onChange={(e)=> setPfAvatarFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={()=>setProfileOpen(false)}>Cancel</Button>
            <Button
              disabled={pfSaving}
              onClick={async ()=>{
                if (!user) return;
                setPfSaving(true);
                try {
                  // 1) Update basic profile
                  const upd = await updateUserProfile({ id: user.id, full_name: pfName || user.full_name, department: pfDept || null, about: pfAbout || null });
                  if ((upd as any).error) {
                    setErrorMsg(((upd as any).error as any)?.message || 'Failed to update profile');
                    return;
                  }
                  setUserAbout(pfAbout || '');
                  // 2) Optional avatar upload (best-effort)
                  if (pfAvatarFile) {
                    const path = `${user.id}/${Date.now()}_${pfAvatarFile.name}`;
                    const up = await supabase.storage.from('avatars').upload(path, pfAvatarFile, { upsert: true });
                    if (!(up as any).error) {
                      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
                      // Try to save to users.avatar_url if column exists
                      try { await supabase.from('users').update({ avatar_url: pub.publicUrl }).eq('id', user.id); } catch {}
                    }
                  }
                  setProfileOpen(false);
                } finally {
                  setPfSaving(false);
                }
              }}
            >Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Document dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="ed_title">Title</Label>
              <Input id="ed_title" value={edTitle} onChange={(e)=>setEdTitle(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ed_date">{editingDoc?.type_id === 'certificate' ? 'Issued On' : 'Publication Date'}</Label>
              <Input id="ed_date" type="date" value={edDate} onChange={(e)=>setEdDate(e.target.value)} />
            </div>
            {editingDoc?.type_id === 'conference_paper' && (
              <div>
                <Label htmlFor="ed_venue">Conference / Venue</Label>
                <Input id="ed_venue" value={edVenue} onChange={(e)=>setEdVenue(e.target.value)} />
              </div>
            )}
            {editingDoc?.type_id !== 'certificate' && (
              <div>
                <Label htmlFor="ed_status">Status</Label>
                <Select value={edStatus} onValueChange={(v)=> setEdStatus(v as any)}>
                  <SelectTrigger id="ed_status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="under_review">Under Review</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label htmlFor="ed_file">File URL</Label>
              <Input id="ed_file" placeholder="https://...pdf" value={edFile} onChange={(e)=>setEdFile(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={()=> setEditOpen(false)}>Cancel</Button>
            <Button disabled={edSaving} onClick={async ()=>{
              if (!user?.id || !editingDoc) return;
              if (!edTitle.trim()) { alert('Title is required'); return; }
              setEdSaving(true);
              try {
                const md = { ...(editingDoc.metadata || {}) } as any;
                if (editingDoc.type_id === 'certificate') {
                  if (edDate) { md.issue_date = edDate; md.publication_date = edDate; }
                } else if (editingDoc.type_id === 'patent' || editingDoc.type_id === 'conference_paper') {
                  if (edDate) md.publication_date = edDate;
                }
                if (editingDoc.type_id === 'conference_paper') md.conference_name = edVenue || null;
                const upd = await updateDocument(editingDoc.id, {
                  title: edTitle.trim(),
                  status: editingDoc.type_id === 'certificate' ? 'published' : edStatus,
                  file_url: edFile?.trim() || null,
                  metadata: md,
                } as any, user.id);
                // Update local state list
                const apply = (arr: any[]) => arr.map(d => d.id === editingDoc.id ? { ...d, ...upd } : d);
                if (editingDoc.type_id === 'patent') setPatents(prev => apply(prev));
                if (editingDoc.type_id === 'certificate') setCertificates(prev => apply(prev));
                if (editingDoc.type_id === 'conference_paper') setConferences(prev => apply(prev));
                setEditOpen(false);
              } catch (e:any) {
                alert(e?.message || 'Failed to update document');
              } finally {
                setEdSaving(false);
              }
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
          </DialogHeader>
          {previewUrl ? (
            (() => {
              const src = computePreviewSrc(previewUrl);
              return src ? (
                <div className="aspect-[4/3] w-full">
                  <iframe src={src} className="w-full h-full rounded" />
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">This link cannot be previewed here. Open it in a new tab.</p>
                  <a className="text-primary underline" href={previewUrl} target="_blank" rel="noreferrer">Open link</a>
                </div>
              );
            })()
          ) : (
            <p className="text-sm text-muted-foreground">No file available</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Change Password dialog */}
      <Dialog open={cpOpen} onOpenChange={setCpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="cp_current">Current password</Label>
              <Input id="cp_current" type="password" value={cpCurrent} onChange={(e)=>setCpCurrent(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="cp_new">New password</Label>
              <Input id="cp_new" type="password" value={cpNew} onChange={(e)=>setCpNew(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="cp_confirm">Confirm new password</Label>
              <Input id="cp_confirm" type="password" value={cpConfirm} onChange={(e)=>setCpConfirm(e.target.value)} />
            </div>
            {cpMsg && <p className="text-sm text-red-600">{cpMsg}</p>}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={()=>setCpOpen(false)}>Cancel</Button>
            <Button disabled={cpLoading} onClick={async ()=>{
              if (!user?.id) { setCpMsg('Not logged in.'); return; }
              if (!cpCurrent || !cpNew || !cpConfirm) { setCpMsg('Please fill all fields.'); return; }
              if (cpNew !== cpConfirm) { setCpMsg('New passwords do not match.'); return; }
              setCpLoading(true);
              setCpMsg(null);
              const res = await changePassword({ userId: user.id, currentPassword: cpCurrent, newPassword: cpNew });
              setCpLoading(false);
              if ((res as any).error) { setCpMsg(((res as any).error as any).message || 'Failed to change password'); return; }
              setCpCurrent(''); setCpNew(''); setCpConfirm(''); setCpOpen(false);
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Dashboard;
