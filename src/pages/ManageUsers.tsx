import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SiteHeader from '@/components/layout/SiteHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getSessionUser, DEPARTMENT_VALUES } from '@/utils/auth';
import { listUsers, setUserRole, setUserStatus, updateUserProfile, type UserRow, getUserRole } from '@/utils/users';

const PAGE_SIZE = 20;

const ManageUsers = () => {
  const me = getSessionUser();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [myRole, setMyRole] = useState<string | undefined>(undefined);
  const [showDebug, setShowDebug] = useState(false);

  const [edit, setEdit] = useState<Record<string, { full_name: string; department: string | null; role?: 'admin' | 'hod' | 'user'; status?: 'active' | 'disabled'; }>>({});
  const hasEdits = useMemo(() => Object.keys(edit).length > 0, [edit]);

  async function load() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, count, error } = await listUsers({ q, role, status, page, pageSize: PAGE_SIZE });
      if (error) setErrorMsg((error as any).message || 'Failed to load');
      else {
        setRows(data || []);
        setTotal(count || 0);
        // Clear any staged edits to avoid stale overrides after a server refresh
        setEdit({});
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadRole() {
      if (!me?.id) { setMyRole(undefined); return; }
      const { role } = await getUserRole(me.id);
      if (active) setMyRole(role);
    }
    loadRole();
    return () => { active = false; };
  }, [me?.id]);

  useEffect(() => {
    if (hasEdits) return; // avoid wiping staged edits while editing
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, role, status, page, hasEdits]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const saveProfile = async (u: UserRow) => {
    const e = edit[u.id];
    if (!e) return;
    const tasks: Promise<any>[] = [];
    // name/department changes
    if (e.full_name !== u.full_name || (e.department || null) !== (u.department || null)) {
      tasks.push(updateUserProfile({ id: u.id, full_name: e.full_name, department: e.department }));
    }
    // role change
    if (e.role && e.role !== (u.role as any || 'user')) {
      tasks.push(setUserRole(u.id, e.role));
    }
    // status change
    if (e.status && e.status !== (u.status as any || 'active')) {
      tasks.push(setUserStatus(u.id, e.status));
    }
    if (tasks.length === 0) return;
    try {
      const results = await Promise.all(tasks);
      const err = results.find(r => (r as any)?.error);
      if (err) throw (err as any).error;
      // Optimistically update table
      setRows(prev => prev.map(r => r.id === u.id ? {
        ...r,
        full_name: e.full_name,
        department: e.department ?? null,
        role: e.role ?? (r.role as any),
        status: e.status ?? (r.status as any),
      } : r));
      setEdit(prev => { const n = { ...prev }; delete n[u.id]; return n; });
      // Also refresh from server to ensure consistency
      load();
    } catch (e: any) {
      alert(e?.message || 'Failed to update');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="container mx-auto py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Manage Users</h1>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={()=>load()}>Refresh</Button>
            <Button type="button" variant="outline" onClick={()=>setShowDebug(v=>!v)}>{showDebug ? 'Hide' : 'Show'} Debug</Button>
          </div>
        </div>

        {myRole !== 'admin' && (
          <p className="text-sm text-red-600">Access denied. Admins only.</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2">
            <Label htmlFor="q">Search</Label>
            <Input id="q" value={q} onChange={(e)=>{ setPage(1); setQ(e.target.value); }} placeholder="Name or email" />
          </div>
          <div>
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={(v)=>{ setPage(1); setRole(v==='any'?'':v); }}>
              <SelectTrigger id="role"><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="hod">HOD</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={(v)=>{ setPage(1); setStatus(v==='any'?'':v); }}>
              <SelectTrigger id="status"><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
        {showDebug && (
          <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-48">{JSON.stringify(rows.slice(0,5), null, 2)}</pre>
        )}

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground">Loading...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground">No users</TableCell></TableRow>
              ) : rows.map((u) => {
                const e = edit[u.id] || { full_name: u.full_name, department: u.department, role: (u.role as any) ?? 'user', status: (u.status as any) ?? 'active' };
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Input value={e.full_name} onChange={(ev)=> setEdit(prev=>({ ...prev, [u.id]: { ...e, full_name: ev.target.value } }))} />
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Select value={e.department || 'none'} onValueChange={(v)=> setEdit(prev=>({ ...prev, [u.id]: { ...e, department: (v === 'none') ? null : v } }))}>
                        <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">-</SelectItem>
                          {DEPARTMENT_VALUES.map(d => (
                            <SelectItem key={d} value={d}>{d.toUpperCase()}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={(e.role as any) ?? 'user'} onValueChange={(v)=> setEdit(prev=>({ ...prev, [u.id]: { ...e, role: v as any } }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="hod">HOD</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={(e.status as any) ?? 'active'} onValueChange={(v)=> setEdit(prev=>({ ...prev, [u.id]: { ...e, status: v as any } }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="disabled">Disabled</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={()=> saveProfile(u)} disabled={!edit[u.id]}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={()=> setEdit(prev => { const n = { ...prev }; delete n[u.id]; return n; })} disabled={!edit[u.id]}>Cancel</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
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

export default ManageUsers;
