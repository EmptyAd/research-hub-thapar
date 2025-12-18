import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSessionUser, logout, SESSION_CHANGE_EVENT } from "@/utils/auth";
import { getUserRole } from "@/utils/users";
import { supabase } from "@/utils/supabaseClient";
import { Bell, Settings, User as UserIcon } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Simple color palette for charts
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"]; 

const Analytics = () => {
  useEffect(() => { document.title = "Analytics | ThaparAcad"; }, []);

  const [user, setUser] = useState(getSessionUser());
  const [role, setRole] = useState<string | undefined>(undefined);
  const [users, setUsers] = useState<Array<{ id: string; full_name: string }>>([]);

  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [userId, setUserId] = useState<string>("all");
  const [userQuery, setUserQuery] = useState<string>("");
  const [docType, setDocType] = useState<string>("all"); // all | research | patent | certificate | conference_paper | other
  const [groupBy, setGroupBy] = useState<"month" | "year" | "last30">("month");
  const [preset, setPreset] = useState<"CUSTOM" | "1D" | "5D" | "1M" | "3M" | "6M" | "1Y" | "2Y" | "ALL">("CUSTOM");
  const [loading, setLoading] = useState(false);

  const [rpList, setRpList] = useState<any[]>([]);
  const [docList, setDocList] = useState<any[]>([]);

  const navigate = useNavigate();

  // Guard: admin only
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

  useEffect(() => {
    const onSession = () => setUser(getSessionUser());
    window.addEventListener(SESSION_CHANGE_EVENT, onSession as any);
    window.addEventListener('storage', onSession);
    return () => {
      window.removeEventListener(SESSION_CHANGE_EVENT, onSession as any);
      window.removeEventListener('storage', onSession);
    };
  }, []);

  // Load user list for filter
  useEffect(() => {
    async function loadUsers() {
      const { data } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('status', 'active')
        .order('full_name', { ascending: true });
      setUsers((data as any[])?.map(u => ({ id: u.id, full_name: u.full_name || 'Unknown' })) || []);
    }
    loadUsers();
  }, []);

  const effectiveRange = () => {
    const now = new Date();
    if (preset === '1D') return { from: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), to: now };
    if (preset === '5D') return { from: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), to: now };
    if (preset === '1M') { const d = new Date(now); d.setMonth(d.getMonth() - 1); return { from: d, to: now }; }
    if (preset === '3M') { const d = new Date(now); d.setMonth(d.getMonth() - 3); return { from: d, to: now }; }
    if (preset === '6M') { const d = new Date(now); d.setMonth(d.getMonth() - 6); return { from: d, to: now }; }
    if (preset === '1Y') { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return { from: d, to: now }; }
    if (preset === '2Y') { const d = new Date(now); d.setFullYear(d.getFullYear() - 2); return { from: d, to: now }; }
    if (preset === 'ALL') return { from: null as Date | null, to: null as Date | null };
    // CUSTOM
    const f = dateFrom ? new Date(dateFrom) : null;
    const t = dateTo ? new Date(dateTo) : null;
    return { from: f, to: t };
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const er = effectiveRange();
      const effFrom = groupBy === 'last30' ? new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000) : er.from;
      const effTo = groupBy === 'last30' ? now : er.to;
      // Research papers
      let rpq = supabase.from('research_papers').select('id, created_at, owner');
      if (userId !== 'all') rpq = rpq.eq('owner', userId);
      const rpRes = await rpq;
      const rp = (rpRes.data || []) as any[];
      const from = effFrom;
      const to = effTo;
      let rpFilt = rp.filter(r => {
        const dtStr = r.created_at as string;
        if (!dtStr) return !(from || to);
        const dt = new Date(dtStr);
        if (from && dt < from) return false;
        if (to && dt > to) return false;
        return true;
      });
      // apply docType to research list
      if (docType !== 'all' && docType !== 'research') {
        rpFilt = [];
      }
      setRpList(rpFilt);

      // Other documents
      let dq = supabase.from('documents').select('id, type_id, created_by, created_at, metadata');
      if (userId !== 'all') dq = dq.eq('created_by', userId);
      const dRes = await dq;
      const docs = (dRes.data || []) as any[];
      let dFilt = docs.filter(d => {
        const md = d?.metadata || {};
        const dtStr = md.issue_date || md.publication_date || d.created_at;
        if (!dtStr) return !(from || to);
        const dt = new Date(dtStr);
        if (from && dt < from) return false;
        if (to && dt > to) return false;
        return true;
      });
      // apply docType to documents list
      if (docType === 'research') {
        dFilt = [];
      } else if (docType !== 'all') {
        if (docType === 'other') {
          dFilt = dFilt.filter(d => !['patent','certificate','conference_paper'].includes(d.type_id));
        } else {
          dFilt = dFilt.filter(d => d.type_id === docType);
        }
      }
      setDocList(dFilt);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [dateFrom, dateTo, userId, docType, groupBy, preset]);

  // Aggregations
  const totalResearch = rpList.length;
  const totalOtherDocs = docList.length; // patents, certificates, conferences
  const totalUploads = totalResearch + totalOtherDocs;

  // Helpers
  const keyForWithBucket = (s: string, bucket: 'day'|'month'|'year') => {
    const d = new Date(s);
    if (bucket === 'year') return `${d.getFullYear()}`;
    if (bucket === 'day') return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; // month
  };

  // Area: uploads over time per month
  const areaData = useMemo(() => {
    // determine bucket from effective range, unless 'last30' forces days
    const { from, to } = effectiveRange();
    let bucket: 'day'|'month'|'year' = 'month';
    if (groupBy === 'last30') bucket = 'day';
    else if (from && to) {
      const spanDays = Math.ceil((to.getTime() - from.getTime()) / (24*60*60*1000));
      if (spanDays <= 35) bucket = 'day';
      else if (spanDays >= 400) bucket = 'year';
      else bucket = 'month';
    } else if (preset === 'ALL') bucket = 'year';

    const map = new Map<string, { bucket: string; research: number; other: number; total: number }>();
    rpList.forEach(r => {
      const k = keyForWithBucket(r.created_at, bucket);
      const row = map.get(k) || { bucket: k, research: 0, other: 0, total: 0 };
      row.research += 1; row.total += 1; map.set(k, row);
    });
    docList.forEach(d => {
      const md = d?.metadata || {}; const ds = md.issue_date || md.publication_date || d.created_at;
      const k = keyForWithBucket(ds, bucket);
      const row = map.get(k) || { bucket: k, research: 0, other: 0, total: 0 };
      row.other += 1; row.total += 1; map.set(k, row);
    });
    const arr = Array.from(map.values());
    arr.sort((a,b)=> a.bucket.localeCompare(b.bucket));
    return arr;
  }, [rpList, docList, groupBy, preset, dateFrom, dateTo]);

  // Pie: by type
  const pieData = useMemo(() => {
    const map = new Map<string, number>();
    if (totalResearch > 0) map.set('Research Paper', totalResearch);
    docList.forEach(d => {
      const t = d.type_id === 'patent' ? 'Patent' : d.type_id === 'certificate' ? 'Certificate' : d.type_id === 'conference_paper' ? 'Conference' : d.type_id || 'Other';
      map.set(t, (map.get(t) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [totalResearch, docList]);

  // Bar: user-wise uploads
  const barData = useMemo(() => {
    const map = new Map<string, number>();
    const nameById = new Map(users.map(u => [u.id, u.full_name] as const));
    rpList.forEach(r => { const n = nameById.get(r.owner) || 'Unknown'; map.set(n, (map.get(n)||0)+1); });
    docList.forEach(d => { const n = nameById.get(d.created_by) || 'Unknown'; map.set(n, (map.get(n)||0)+1); });
    const arr = Array.from(map.entries()).map(([name, value]) => ({ name, value }));
    // show top 12 to avoid overcrowding
    return arr.sort((a,b)=> b.value - a.value).slice(0, 12);
  }, [rpList, docList, users]);

  if (role && role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">Not authorized</h1>
          <p className="text-muted-foreground">This page is only for admins.</p>
          <Button asChild><Link to="/">Go Home</Link></Button>
        </div>
      </div>
    );
  }

  const onLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="min-h-screen bg-background">
      {/* Header (consistent with Report) */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="container mx-auto py-3 grid grid-cols-3 items-center gap-3">
          <div className="flex flex-col gap-2">
            <Link to="/" className="text-xl font-bold leading-none">ThaparAcad</Link>
          </div>
          <div />
          <div className="flex justify-end items-center gap-4">
            {user && <Bell className="h-5 w-5" />}
            {user && (
              <Link to="/dashboard" aria-label="Dashboard" className="text-foreground/80 hover:text-foreground">
                <UserIcon className="h-5 w-5" />
              </Link>
            )}
            <button aria-label="Settings" className="text-foreground/80 hover:text-foreground">
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto py-8 space-y-6">
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" value={dateFrom} onChange={(e)=> setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" value={dateTo} onChange={(e)=> setDateTo(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="usr">User</Label>
            <Input placeholder="Search user" value={userQuery} onChange={(e)=> setUserQuery(e.target.value)} className="mb-2" />
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger id="usr" className="w-[220px]"><SelectValue placeholder="All users" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {users.filter(u => u.full_name?.toLowerCase().includes(userQuery.toLowerCase()))
                  .map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="dtype">Document Type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger id="dtype" className="w-[220px]"><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="research">Research Papers</SelectItem>
                <SelectItem value="patent">Patents</SelectItem>
                <SelectItem value="certificate">Certificates</SelectItem>
                <SelectItem value="conference_paper">Conference Papers</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="grp">Group By</Label>
            <Select value={groupBy} onValueChange={(v)=> setGroupBy(v as any)}>
              <SelectTrigger id="grp" className="w-[220px]"><SelectValue placeholder="Month" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Month</SelectItem>
                <SelectItem value="year">Year</SelectItem>
                <SelectItem value="last30">Past 30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={()=>{ setDateFrom(""); setDateTo(""); setUserId("all"); }}>Reset</Button>
            <Button onClick={fetchData} disabled={loading}>Refresh</Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">Research Papers</p>
            <p className="text-3xl font-semibold">{totalResearch}</p>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">Other Documents</p>
            <p className="text-3xl font-semibold">{totalOtherDocs}</p>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">Total Uploads</p>
            <p className="text-3xl font-semibold">{totalUploads}</p>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border bg-card p-4">
            <h3 className="font-semibold mb-3">Uploads Over Time</h3>
            <div className="flex gap-4">
              <div className="flex-1">
                <AreaChart width={600} height={260} data={areaData} className="w-full">
                  <defs>
                    <linearGradient id="colorA" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="total" stroke="#3b82f6" fillOpacity={1} fill="url(#colorA)" />
                </AreaChart>
              </div>
              <div className="flex flex-col gap-2">
                {(["1D","5D","1M","3M","6M","1Y","2Y","ALL"] as const).map(p => (
                  <Button key={p} variant={preset === p ? "default" : "outline"} size="sm" onClick={()=> setPreset(p)}>
                    {p}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <h3 className="font-semibold mb-3">User-wise Uploads</h3>
            <BarChart width={600} height={260} data={barData} className="w-full">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#10b981" />
            </BarChart>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6">
          <div className="rounded-xl border bg-card p-4">
            <h3 className="font-semibold mb-3">By Document Type</h3>
            <PieChart width={600} height={280} className="w-full">
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                {pieData.map((entry, index) => (
                  <Cell key={`c-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Analytics;
