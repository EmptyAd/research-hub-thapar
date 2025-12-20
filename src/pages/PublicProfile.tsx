import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import SiteHeader from '@/components/layout/SiteHeader';
import { supabase } from '@/utils/supabaseClient';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { listDocuments } from '@/utils/documents';

const PublicProfile = () => {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [about, setAbout] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'papers'|'patents'|'certificates'|'conferences'>('papers');
  const [papers, setPapers] = useState<any[]>([]);
  const [sortBy, setSortBy] = useState<'index'|'title'|'authors'|'department'|'status'|'year'>('title');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc');
  const [patents, setPatents] = useState<any[]>([]);
  const [certificates, setCertificates] = useState<any[]>([]);
  const [conferences, setConferences] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!id) return;
      setLoading(true);
      try {
        const { data: u } = await supabase.from('users').select('id, full_name, email, department, about, status').eq('id', id).maybeSingle();
        if (!active) return;
        setUser(u || null);
        setAbout((u as any)?.about || '');
        if ((u as any)?.status === 'disabled') {
          setPapers([]); setPatents([]); setCertificates([]); setConferences([]); setLoading(false); return;
        }
        // Papers via documents util (owner or co-author)
        const [rpList, pat, cert, conf] = await Promise.all([
          listDocuments({ typeId: 'research_paper', userId: id, page: 1, pageSize: 50, sortBy: 'created_at', sortDir: 'desc' }),
          supabase.from('documents').select('*').eq('type_id', 'patent').eq('created_by', id).order('created_at', { ascending: false }).limit(20),
          supabase.from('documents').select('*').eq('type_id', 'certificate').eq('created_by', id).order('created_at', { ascending: false }).limit(20),
          supabase.from('documents').select('*').eq('type_id', 'conference_paper').eq('created_by', id).order('created_at', { ascending: false }).limit(20),
        ]);
        if (!active) return;
        const rpData = (rpList as any)?.data || [];
        const mappedPapers = rpData.map((d: any) => ({
          id: d.id,
          title: d.title,
          authors: (d.authors || []).map((a: any) => a.user?.full_name).filter(Boolean),
          department: d.metadata?.department || null,
          status: d.status,
          issue_date: d.metadata?.issue_date || d.metadata?.publication_date || null,
          file_url: d.file_url,
        }));
        setPapers(mappedPapers);
        setPatents(pat.data || []);
        setCertificates(cert.data || []);
        setConferences(conf.data || []);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [id]);

  const getYear = (p: any) => {
    if (typeof p.publication_year === 'number') return p.publication_year;
    if (typeof p.issue_date === 'string' && p.issue_date.length >= 4) return Number(p.issue_date.slice(0,4));
    return undefined;
  };

  const toggleSort = (field: 'index'|'title'|'authors'|'department'|'status'|'year') => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('asc'); }
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

  if (user && user.status === 'disabled') {
    return (
      <div className="container mx-auto py-6">
        <div className="rounded-md border p-6">
          <h1 className="text-xl font-semibold">Profile Unavailable</h1>
          <p className="text-sm text-muted-foreground">This user is disabled and their profile is hidden.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <SiteHeader />
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">{user?.full_name || 'Profile'}</h1>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
          {user?.department && (
            <p className="text-sm text-muted-foreground">Department: {String(user.department).toUpperCase()}</p>
          )}
        </div>
        <Button asChild variant="outline"><Link to="/">Back</Link></Button>
      </div>

      {/* About */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">About</h2>
        {about ? (
          <p className="text-sm leading-6 whitespace-pre-wrap">{about}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No bio yet.</p>
        )}
      </section>

      {/* Tabs */}
      <div className="flex gap-2">
        {([
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

      {/* Papers */}
      {activeTab==='papers' && (
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPapers.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground">No papers</TableCell></TableRow>
              ) : sortedPapers.map((p:any, idx:number) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium w-16">{idx+1}</TableCell>
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell>{(p.authors || []).join(', ')}</TableCell>
                  <TableCell>{(p.department || '').toUpperCase() || '-'}</TableCell>
                  <TableCell>{p.status ? (p.status === 'published' ? 'Published' : 'Under Review') : '-'}</TableCell>
                  <TableCell>{getYear(p) ?? '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Patents */}
      {activeTab==='patents' && (
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
              {patents.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-muted-foreground">No patents</TableCell></TableRow>
              ) : patents.map((d:any) => (
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

      {/* Certificates */}
      {activeTab==='certificates' && (
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
              {certificates.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-muted-foreground">No certificates</TableCell></TableRow>
              ) : certificates.map((d:any) => (
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

      {/* Conferences */}
      {activeTab==='conferences' && (
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
              {conferences.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-muted-foreground">No conference papers</TableCell></TableRow>
              ) : conferences.map((d:any) => (
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
      </div>
    </>
  );
};

export default PublicProfile;
