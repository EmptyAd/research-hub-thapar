import { useEffect, useMemo, useState } from 'react';
import { listPapers, type ResearchPaper } from '@/utils/research';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DEPARTMENT_VALUES } from '@/utils/auth';

const Papers = () => {
  const [q, setQ] = useState('');
  const [department, setDepartment] = useState<string>('');
  const [year, setYear] = useState<string>('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [papers, setPapers] = useState<ResearchPaper[]>([]);

  async function load() {
    setLoading(true);
    const yr = year ? parseInt(year, 10) : undefined;
    const { data, error } = await listPapers({ q, department: department as any, year: (yr as any) || undefined, keyword, status: status as any });
    if (!error && data) setPapers(data);
    setLoading(false);
  }

  useEffect(() => {
    document.title = 'Research Papers | ThaparAcad';
    // initial load
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load();
  };

  const rows = useMemo(() => papers, [papers]);

  return (
    <main className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">Research Papers</h1>

      <form onSubmit={onSearch} className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
        <div>
          <Label htmlFor="q">Search</Label>
          <Input id="q" placeholder="Title, journal, conference" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="status">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Any</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="dept">Department</Label>
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger id="dept">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Any</SelectItem>
              {DEPARTMENT_VALUES.map((d) => (
                <SelectItem key={d} value={d}>{d.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="year">Year</Label>
          <Input id="year" type="number" min="1900" max="2100" value={year} onChange={(e) => setYear(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="kw">Keyword</Label>
          <Input id="kw" placeholder="e.g., machine learning" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </div>
        <div className="md:col-span-4 flex gap-2">
          <Button type="submit">Apply Filters</Button>
          <Button type="button" variant="secondary" onClick={() => { setQ(''); setDepartment(''); setYear(''); setKeyword(''); setTimeout(load, 0); }}>Reset</Button>
        </div>
      </form>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">No papers found.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Authors</TableHead>
                <TableHead>Venue</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell>{(p.authors || []).join(', ')}</TableCell>
                  <TableCell>{p.journal || p.conference || '-'}</TableCell>
                  <TableCell>{(p.department || '').toUpperCase() || '-'}</TableCell>
                  <TableCell>{p.status ? (p.status === 'published' ? 'Published' : 'Under Review') : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
};

export default Papers;
