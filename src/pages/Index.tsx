import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { listPapers, type ResearchPaper } from "@/utils/research";
import { deleteDocument } from "@/utils/documents";
import { supabase } from "@/utils/supabaseClient";
import { DEPARTMENT_VALUES, changePassword } from "@/utils/auth";
import { getSessionUser, logout, SESSION_CHANGE_EVENT } from "@/utils/auth";
import { getUserRole } from "@/utils/users";
import { Search, SlidersHorizontal, Bell, User as UserIcon, Settings, Plus, FileText, ScrollText, Award, Mic, Eye, Pencil, Trash, File as DocumentIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SiteHeader from "@/components/layout/SiteHeader";

const Index = () => {
  useEffect(() => {
    document.title = "ThaparAcad Research Portal";
  }, []);

  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(getSessionUser());
  const [showFilters, setShowFilters] = useState(false);
  const [role, setRole] = useState<string | undefined>(undefined);
  const [department, setDepartment] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [mineOnly, setMineOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rows, setRows] = useState<ResearchPaper[]>([]);
  const [total, setTotal] = useState(0);
  const [patents, setPatents] = useState<any[]>([]);
  const [certificates, setCertificates] = useState<any[]>([]);
  const [conferences, setConferences] = useState<any[]>([]);
  const [people, setPeople] = useState<Array<{ id: string; full_name: string; email: string; department: string | null }>>([]);
  const pageSize = 10;
  const [sortBy, setSortBy] = useState<'created_at' | 'issue_date' | 'title' | 'status' | 'department' | 'authors' | 'publication_year'>('issue_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cpOpen, setCpOpen] = useState(false);
  const [cpCurrent, setCpCurrent] = useState('');
  const [cpNew, setCpNew] = useState('');
  const [cpConfirm, setCpConfirm] = useState('');
  const [cpLoading, setCpLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'papers' | 'patents' | 'certificates' | 'conferences' | 'people'>('papers');
  const [cpMsg, setCpMsg] = useState<string | null>(null);

  // Helper to compute publication year for display

  async function load(overrides?: Partial<{ q: string; department: string; status: string; dateFrom: string; dateTo: string; mineOnly: boolean; page: number; sortBy: 'created_at' | 'issue_date' | 'title' | 'status' | 'department' | 'authors' | 'publication_year'; sortDir: 'asc' | 'desc'; }>) {
    setLoading(true);
    setErrorMsg(null);
    try {
      const qv = overrides?.q ?? q;
      const dep = overrides?.department ?? department;
      const st = overrides?.status ?? status;
      const df = overrides?.dateFrom ?? dateFrom;
      const dt = overrides?.dateTo ?? dateTo;
      const mo = overrides?.mineOnly ?? mineOnly;
      const pg = overrides?.page ?? page;
      const sb = overrides?.sortBy ?? sortBy;
      const sd = overrides?.sortDir ?? sortDir;
      const { data, count, error } = await listPapers(
        { q: qv, department: dep as any, status: st as any, ownerId: mo && user ? user.id : undefined },
        { page: pg, pageSize, dateFrom: df || undefined, dateTo: dt || undefined, sortBy: sb, sortDir: sd, fetchAll: (sb === 'authors' || sb === 'department') }
      );
      if (!error) {
        let list = (data || []) as ResearchPaper[];
        // Hide papers where owner is disabled, if owner field is available
        const owners = Array.from(new Set(list.map((r:any)=>r.owner).filter(Boolean))) as string[];
        if (owners.length > 0) {
          const { data: activeUsers } = await supabase
            .from('users')
            .select('id')
            .in('id', owners)
            .eq('status', 'active');
          const activeSet = new Set((activeUsers || []).map((u:any)=>u.id));
          list = list.filter((r:any)=> !r.owner || activeSet.has(r.owner));
        }
        setRows(list);
        setTotal(count || list.length || 0);
      } else {
        setErrorMsg((error as any)?.message || 'Failed to load');
      }

      // Load documents (patents, certificates, conferences) - latest 10 each
      const text = qv.trim();
      const ownerId = mo && user ? user.id : undefined;
      const docsOrderCol = (() => {
        if (sb === 'title') return 'title';
        if (sb === 'status') return 'status';
        // 'issue_date' not a top-level column for documents; fall back to created_at
        return 'created_at';
      })();
      const asc = sd === 'asc';
      const buildQuery = (typeId: string) => {
        let qd = supabase
          .from('documents')
          .select('*')
          .eq('type_id', typeId)
          .order(docsOrderCol, { ascending: asc, nullsFirst: !asc })
          .limit(10);
        if (ownerId) qd = qd.eq('created_by', ownerId);
        if (text) qd = qd.or(`title.ilike.%${text}%,description.ilike.%${text}%`);
        return qd;
      };
      const [pat, cert, conf] = await Promise.all([
        buildQuery('patent'),
        buildQuery('certificate'),
        buildQuery('conference_paper'),
      ]);
      // Hide documents whose owner is disabled
      const allDocs = [...(pat.data || []), ...(cert.data || []), ...(conf.data || [])] as any[];
      const ownerIds = Array.from(new Set(allDocs.map(d => d.created_by).filter(Boolean)));
      let activeSet: Set<string> | null = null;
      if (ownerIds.length > 0) {
        const { data: activeUsers } = await supabase
          .from('users')
          .select('id')
          .in('id', ownerIds)
          .eq('status', 'active');
        activeSet = new Set((activeUsers || []).map(u => (u as any).id));
      }
      const filt = (arr: any[]) => !activeSet ? arr : arr.filter(d => activeSet!.has(d.created_by));
      setPatents(filt(pat.data || []));
      setCertificates(filt(cert.data || []));
      setConferences(filt(conf.data || []));

      // People search
      if (text) {
        const like = `%${text}%`;
        const ppl = await supabase
          .from('users')
          .select('id, full_name, email, department, status')
          .or(`full_name.ilike.${like},email.ilike.${like}`)
          .eq('status', 'active')
          .order('full_name', { ascending: true })
          .limit(10);
        setPeople(ppl.data as any[] || []);
      } else {
        setPeople([]);
      }
    } catch (_e) {
      // keep previous rows on failure
      setErrorMsg('Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, q, department, status, dateFrom, dateTo, mineOnly, user, sortBy, sortDir]);

  // Sync header navigation query params into state (from Dashboard routing)
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const nq = sp.get('q') || '';
    const nd = sp.get('department') || '';
    const ns = sp.get('status') || '';
    const nf = sp.get('from') || '';
    const nt = sp.get('to') || '';
    setQ(nq);
    setDepartment(nd);
    setStatus(ns);
    setDateFrom(nf);
    setDateTo(nt);
    // Optionally accept sorting from URL later; for now keep defaults
    setPage(1);
    // Fire an immediate load using parsed params to avoid any race with state batching
    load({ q: nq, department: nd, status: ns, dateFrom: nf, dateTo: nt, page: 1 });
  }, [location.search]);

  // Update header instantly when session changes elsewhere
  useEffect(() => {
    const onSession = () => setUser(getSessionUser());
    window.addEventListener(SESSION_CHANGE_EVENT, onSession as any);
    window.addEventListener('storage', onSession);
    return () => {
      window.removeEventListener(SESSION_CHANGE_EVENT, onSession as any);
      window.removeEventListener('storage', onSession);
    };
  }, []);

  // Load role when user changes
  useEffect(() => {
    let active = true;
    async function loadRole() {
      if (!user) { setRole(undefined); return; }
      const { role } = await getUserRole(user.id);
      if (active) setRole(role);
    }
    loadRole();
    return () => { active = false; };
  }, [user]);

  const getYear = (p: ResearchPaper) => {
    if (typeof p.publication_year === 'number') return p.publication_year;
    const d = (p as any).issue_date as string | undefined;
    if (d && d.length >= 4) return Number(d.slice(0,4));
    return undefined;
  };

  const onHeaderSort = (field: 'index'|'title'|'authors'|'department'|'status'|'year') => {
    // Map UI fields to API sort fields
    const map: Record<string, typeof sortBy> = {
      index: 'created_at',
      title: 'title',
      authors: 'authors',
      department: 'department',
      status: 'status',
      year: 'publication_year',
    } as const;
    const apiField = map[field];
    if (sortBy === apiField) {
      const nd = sortDir === 'asc' ? 'desc' : 'asc';
      setSortDir(nd);
      load({ sortBy: apiField, sortDir: nd });
    } else {
      setSortBy(apiField);
      setSortDir('asc');
      load({ sortBy: apiField, sortDir: 'asc' });
    }
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const onAdminDelete = async (id: string) => {
    if (!confirm('Delete this paper?')) return;
    if (!user?.id) return;
    try {
      await deleteDocument(id, user.id);
      setRows(prev => prev.filter(p => p.id !== id));
    } catch {}
  };

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  // Decide preview embedding strategy for a given URL
  const computePreviewSrc = (url: string | null) => {
    if (!url) return null;
    const lower = url.toLowerCase();
    // Use Google Docs Viewer to embed remote PDFs more reliably
    if (lower.endsWith('.pdf')) {
      return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`;
    }
    // For non-PDF links, many sites block iframes. Prefer opening in a new tab.
    return null;
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-white rounded-xl shadow-sm p-6 flex items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-muted shadow" />
          <div className="flex-1">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-2xl font-semibold">Welcome{user ? `, ${user.full_name}` : ''}</h1>
                <p className="text-sm text-muted-foreground">Discover and showcase research at ThaparAcad.</p>
              </div>
              {(role === 'admin' || role === 'hod') && (
                <div className="flex gap-2">
                  <Button asChild variant="outline"><Link to="/report">Insights</Link></Button>
                </div>
              )}
            </div>
          </div>
        </div>

        

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

        {/* Toolbar removed: header-click sorting only */}

        {/* Tabs + context-aware Upload */}
        <div className="flex items-center justify-between gap-2 mt-2">
          <div className="flex gap-2">
            {([
              { key: 'papers', label: 'Research Paper' },
              { key: 'patents', label: 'Patents' },
              { key: 'certificates', label: 'Certificates' },
              { key: 'conferences', label: 'Conference' },
              { key: 'people', label: 'People' },
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
          {activeTab !== 'people' && (
            <Button
              onClick={() => {
                const type = activeTab === 'papers' ? 'research_paper' : activeTab === 'patents' ? 'patent' : activeTab === 'certificates' ? 'certificate' : 'conference_paper';
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

        {/* Papers tab */}
        {activeTab === 'papers' && (
        <div className="mt-6">
          {errorMsg && (
            <p className="mb-3 text-sm text-red-600">{errorMsg}</p>
          )}
          {loading ? (
            <div className="rounded-md border p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
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
          ) : rows.length === 0 ? (
            <div className="rounded-md border p-10 text-center text-muted-foreground">
              <div className="text-3xl mb-2">📄</div>
              <p>No research papers added yet.</p>
              {user && (
                <p className="text-sm">Click <span className="font-medium">Create</span> to add your first paper.</p>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none" onClick={()=>onHeaderSort('index')}>Index {sortBy==='created_at' ? (sortDir==='asc'?'↑':'↓') : ''}</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={()=>onHeaderSort('title')}>Title {sortBy==='title' ? (sortDir==='asc'?'↑':'↓') : ''}</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={()=>onHeaderSort('authors')}>Authors {sortBy==='authors' ? (sortDir==='asc'?'↑':'↓') : ''}</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={()=>onHeaderSort('department')}>Department {sortBy==='department' ? (sortDir==='asc'?'↑':'↓') : ''}</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={()=>onHeaderSort('status')}>Status {sortBy==='status' ? (sortDir==='asc'?'↑':'↓') : ''}</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={()=>onHeaderSort('year')}>Year {sortBy==='publication_year' ? (sortDir==='asc'?'↑':'↓') : ''}</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p, idx) => (
                    <TableRow key={p.id} className="hover:bg-gray-50 transition h-14">
                      <TableCell className="font-medium w-16">{(page-1)*pageSize + idx + 1}</TableCell>
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
                          {role === 'admin' && (
                            <>
                              <Pencil className="w-5 h-5 cursor-pointer text-gray-600 hover:text-green-600" onClick={() => navigate(`/upload?edit=${p.id}`)} />
                              <Trash className="w-5 h-5 cursor-pointer text-red-500 hover:text-red-700" onClick={() => onAdminDelete(p.id)} />
                            </>
                          )}
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

        {/* Patents tab */}
        {activeTab === 'patents' && (
          <section className="space-y-3 mt-6">
            {loading && patents.length === 0 ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : patents.length === 0 ? (
              <p className="text-muted-foreground">No patents found.</p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Publication Date</TableHead>
                      <TableHead>File</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {patents.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.title}</TableCell>
                        <TableCell>{d.status === 'published' ? 'Granted' : 'Pending'}</TableCell>
                        <TableCell>{(d.metadata?.publication_date as string) || '-'}</TableCell>
                        <TableCell>{d.file_url ? <a className="text-primary" href={d.file_url} target="_blank">Open</a> : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        )}

        {/* People tab */}
        {activeTab === 'people' && (
          <section className="space-y-3 mt-6">
            {q.trim() === '' ? (
              <p className="text-muted-foreground">Type a name or email to search people.</p>
            ) : people.length === 0 ? (
              <p className="text-muted-foreground">No people found.</p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {people.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.full_name}</TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>{u.department ? u.department.toUpperCase() : '-'}</TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="outline">
                            <Link to={`/profile/${u.id}`}>View</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        )}

        {/* Certificates tab */}
        {activeTab === 'certificates' && (
          <section className="space-y-3 mt-6">
            {loading && certificates.length === 0 ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : certificates.length === 0 ? (
              <p className="text-muted-foreground">No certificates found.</p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Issued On</TableHead>
                      <TableHead>File</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {certificates.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.title}</TableCell>
                        <TableCell>{(d.metadata?.issue_date as string) || (d.metadata?.publication_date as string) || '-'}</TableCell>
                        <TableCell>{d.file_url ? <a className="text-primary" href={d.file_url} target="_blank">Open</a> : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        )}

        {/* Conference tab */}
        {activeTab === 'conferences' && (
          <section className="space-y-3 mt-6">
            {loading && conferences.length === 0 ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : conferences.length === 0 ? (
              <p className="text-muted-foreground">No conference papers found.</p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Venue</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>File</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conferences.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.title}</TableCell>
                        <TableCell>{(d.metadata?.conference_name as string) || '-'}</TableCell>
                        <TableCell>{(d.metadata?.publication_date as string) || '-'}</TableCell>
                        <TableCell>{d.file_url ? <a className="text-primary" href={d.file_url} target="_blank">Open</a> : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {totalPages} • {total} total</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</Button>
            <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </main>
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
          <div className="flex justify-end gap-2">
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
