import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SiteHeader from '@/components/layout/SiteHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getSessionUser } from '@/utils/auth';
import { supabase } from '@/utils/supabaseClient';

export type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  user_id: string;
  created_at: string;
  metadata: any;
};

const PAGE_SIZE = 20;

const AuditLog = () => {
  const user = getSessionUser();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [action, setAction] = useState('');
  const [etype, setEtype] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [qUser, setQUser] = useState(''); // filter by user_id exact or substring
  const [total, setTotal] = useState(0);

  async function load() {
    setLoading(true);
    setErrorMsg(null);
    try {
      let query = supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });
      if (action) query = query.eq('action', action);
      if (etype) query = query.eq('entity_type', etype);
      if (dateFrom) query = query.gte('created_at', dateFrom);
      if (dateTo) query = query.lte('created_at', dateTo);
      if (qUser.trim()) query = query.ilike('user_id', `%${qUser.trim()}%`);
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);
      const { data, error, count } = await query;
      if (error) {
        setErrorMsg((error as any).message || 'Failed to load');
      } else {
        setRows((data || []) as AuditRow[]);
        setTotal(count || 0);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, action, etype, dateFrom, dateTo, qUser]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="container mx-auto py-8 space-y-6">
        <h1 className="text-2xl font-semibold">Audit Log</h1>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <Label htmlFor="action">Action</Label>
            <Input id="action" value={action} onChange={(e)=>setAction(e.target.value)} placeholder="create / update / delete" />
          </div>
          <div>
            <Label htmlFor="etype">Entity</Label>
            <Input id="etype" value={etype} onChange={(e)=>setEtype(e.target.value)} placeholder="paper / user" />
          </div>
          <div>
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" value={dateFrom} onChange={(e)=>setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" value={dateTo} onChange={(e)=>setDateTo(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="user">User ID</Label>
            <Input id="user" value={qUser} onChange={(e)=>setQUser(e.target.value)} placeholder="Filter by user id" />
          </div>
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Entity ID</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Metadata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground">Loading...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground">No entries</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell>{r.action}</TableCell>
                  <TableCell>{r.entity_type}</TableCell>
                  <TableCell>{r.entity_id}</TableCell>
                  <TableCell className="font-mono text-xs">{r.user_id}</TableCell>
                  <TableCell className="max-w-[360px] truncate" title={JSON.stringify(r.metadata)}>
                    {r.metadata ? JSON.stringify(r.metadata) : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {totalPages} • {total} total</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Previous</Button>
            <Button type="button" variant="outline" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>Next</Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AuditLog;
