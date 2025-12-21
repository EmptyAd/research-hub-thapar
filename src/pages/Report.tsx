import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import SiteHeader from "@/components/layout/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSessionUser, logout, SESSION_CHANGE_EVENT } from "@/utils/auth";
import { getUserRole } from "@/utils/users";
import { listPapers, type ResearchPaper } from "@/utils/research";
import { DEPARTMENT_VALUES } from "@/utils/auth";
import { Search, SlidersHorizontal, Bell, User as UserIcon, Settings } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/utils/supabaseClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";

// Replace characters not supported by pdf-lib's StandardFonts (WinAnsi) with safe ASCII
const sanitizePdfText = (s: any) => {
  const str = String(s ?? '');
  return str
    .normalize('NFKD')
    // Common fancy punctuation replacements
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/[…]/g, '...')
    .replace(/[•∙·]/g, '*')
    .replace(/[‖¦]/g, '|')
    .replace(/[≠≈≤≥±]/g, '~')
    .replace(/[†‡§¶]/g, '')
    // Remove remaining control/non-ASCII that may break WinAnsi
    .replace(/[\u0100-\uFFFF]/g, '?');
};

const Report = () => {
  useEffect(() => { document.title = "Generate Report | ThaparAcad"; }, []);

  const [user, setUser] = useState(getSessionUser());
  const [role, setRole] = useState<string | undefined>(undefined);
  const location = useLocation();

  const [department, setDepartment] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [docType, setDocType] = useState<'any'|'research_paper'|'patent'|'certificate'|'conference_paper'>('any');
  const [userId, setUserId] = useState<string>('all'); // legacy single-select (kept for compatibility)
  const [userQuery, setUserQuery] = useState<string>('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ResearchPaper[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [areaData, setAreaData] = useState<Array<{ bucket: string; total: number }>>([]);
  const [barData, setBarData] = useState<Array<{ name: string; value: number }>>([]);
  const [pieData, setPieData] = useState<Array<{ name: string; value: number }>>([]);
  const [deptStack, setDeptStack] = useState<Array<Record<string, any>>>([]);
  const [deptKeys, setDeptKeys] = useState<string[]>([]);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisHtml, setAnalysisHtml] = useState<string>("");
  const [analysisPdfUrl, setAnalysisPdfUrl] = useState<string | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    const onSession = () => setUser(getSessionUser());
    window.addEventListener(SESSION_CHANGE_EVENT, onSession as any);
    window.addEventListener('storage', onSession);
    return () => {
      window.removeEventListener(SESSION_CHANGE_EVENT, onSession as any);
      window.removeEventListener('storage', onSession);
    };
  }, []);

  // Load role and guard access (admins and HODs only)
  useEffect(() => {
    let active = true;
    async function loadRole() {
      if (!user?.id) { setRole(undefined); return; }
      const { role } = await getUserRole(user.id);
      if (active) setRole(role);
    }
    loadRole();
    return () => { active = false; };
  }, [user?.id]);

  // For non-admin/HOD views, hide the User filter and ensure no explicit user filter is applied
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const scopeMe = sp.get('scope') === 'me';
    const isPriv = role === 'admin' || role === 'hod';
    if (!isPriv || scopeMe) {
      // Do not constrain by created_by via the UI filter; SQL scoping will restrict to own/coauthored
      if (selectedUserIds.length !== 0) setSelectedUserIds([]);
      if (userId !== 'all') setUserId('all');
    }
  }, [role, location.search]);

  // Load users for charts (uploader names)
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

  // Generate analysis summary using documents table (uploader-based)
  const ensureDataLoaded = async () => {
    if (rows.length === 0) {
      try { await fetchData(); } catch {}
    }
  };

  const generateAnalysis = async () => {
    await ensureDataLoaded();
    setLoading(true);
    try {
      // Build base query over documents
      let q = supabase
        .from('documents')
        .select('id,title,type_id,created_by,created_at,status,metadata')
        .order('created_at', { ascending: false });
      if (docType !== 'any') q = q.eq('type_id', docType);
      if (status) q = q.eq('status', status);
      if (selectedUserIds.length > 0) q = q.in('created_by', selectedUserIds);
      else if (userId !== 'all') q = q.eq('created_by', userId);

      // Role-based scoping: for non-admin/HOD, include only own or coauthored docs
      const sp = new URLSearchParams(location.search);
      const scopeMe = sp.get('scope') === 'me';
      const isPriv = role === 'admin' || role === 'hod';
      const myScope = scopeMe || !isPriv;
      if (myScope && user?.id) {
        const { data: da } = await supabase
          .from('document_authors')
          .select('document_id')
          .eq('user_id', user.id);
        const ids = ((da || []) as any[]).map(r => r.document_id).filter(Boolean);
        if (ids.length > 0) {
          const idsCsv = ids.map((x: string) => `"${x}"`).join(',');
          q = q.or(`created_by.eq.${user.id},id.in.(${idsCsv})`);
        } else {
          q = q.eq('created_by', user.id);
        }
      }

      const { data, error } = await q;
      if (error) throw error;
      let docs = (data || []) as any[];

      // Apply date and department filters (from metadata)
      const from = dateFrom ? new Date(dateFrom) : null;
      const to = dateTo ? new Date(dateTo) : null;
      docs = docs.filter(d => {
        const md = d?.metadata || {};
        const dtStr = md.issue_date || md.publication_date || d.created_at;
        const depStr = (md.department || md.department_text || '').toString().toLowerCase();
        if (department && depStr !== department.toLowerCase()) return false;
        if (!dtStr) return !(from || to);
        const dt = new Date(dtStr);
        if (from && dt < from) return false;
        if (to && dt > to) return false;
        return true;
      });

      // Filter out disabled users' documents
      const activeIdSet = new Set((users || []).map(u => u.id));
      docs = docs.filter(d => !d.created_by || activeIdSet.has(d.created_by));

      // Map user ids
      const userIds = Array.from(new Set(docs.map(d => d.created_by).filter(Boolean)));
      let usersById = new Map<string, { id: string; full_name: string }>();
      if (userIds.length) {
        const CHUNK = 100;
        for (let i = 0; i < userIds.length; i += CHUNK) {
          const slice = userIds.slice(i, i + CHUNK);
          const { data: users } = await supabase
            .from('users')
            .select('id, full_name')
            .in('id', slice);
          (users || []).forEach((u: any) => usersById.set(u.id, { id: u.id, full_name: u.full_name || 'Unknown' }));
        }
      }

      // Counts by type
      const typeLabel = (t: string) => t === 'research_paper' ? 'Research Paper' : t === 'patent' ? 'Patent' : t === 'certificate' ? 'Certificate' : t === 'conference_paper' ? 'Conference' : t;
      const byType = new Map<string, number>();
      docs.forEach(d => byType.set(d.type_id, (byType.get(d.type_id) || 0) + 1));

      // Group by faculty (uploader)
      const byUser = new Map<string, any[]>();
      docs.forEach(d => {
        const uid = d.created_by || 'unknown';
        if (!byUser.has(uid)) byUser.set(uid, []);
        byUser.get(uid)!.push(d);
      });

      // Build HTML report
      const total = docs.length;
      const userKeys = Array.from(byUser.keys()).sort((a, b) => {
        const an = usersById.get(a)?.full_name || 'Unknown';
        const bn = usersById.get(b)?.full_name || 'Unknown';
        return an.localeCompare(bn);
      });

      const countsSection = docType === 'any'
        ? `
      <h2>Counts by Document Type</h2>
      <table>
        <thead><tr><th>Type</th><th>Count</th></tr></thead>
        <tbody>
        ${Array.from(byType.entries()).map(([t, n]) => `<tr><td>${typeLabel(t)}</td><td>${n}</td></tr>`).join('')}
        </tbody>
      </table>
      `
        : `
      <h2>${typeLabel(docType)} Count</h2>
      <p>Total ${typeLabel(docType)}: ${byType.get(docType) || 0}</p>
      `;

      // Build per-faculty rows with Name, Type, Count
      const perFacultyRows: string[] = [];
      userKeys.forEach(uid => {
        const name = (usersById.get(uid)?.full_name || 'Unknown').replace(/</g,'&lt;');
        const arr = byUser.get(uid)!;
        const counts = new Map<string, number>();
        arr.forEach(d => counts.set(d.type_id, (counts.get(d.type_id) || 0) + 1));
        Array.from(counts.keys())
          .sort((a,b)=> typeLabel(a).localeCompare(typeLabel(b)))
          .forEach(tid => {
            perFacultyRows.push(`<tr><td>${name}</td><td>${typeLabel(tid)}</td><td>${counts.get(tid) || 0}</td></tr>`);
          });
      });

      const perFacultyTable = `
      <h2>Documents per Faculty</h2>
      <table>
        <thead><tr><th>Name</th><th>Type</th><th>Count</th></tr></thead>
        <tbody>
          ${perFacultyRows.join('')}
        </tbody>
      </table>
      `;

      const perFacultyLists = `
      <h2>Faculty-wise Document List</h2>
      ${userKeys.map(uid => {
        const name = (usersById.get(uid)?.full_name || 'Unknown').replace(/</g,'&lt;');
        const arr = byUser.get(uid)!;
        // Group this user's docs by type
        const byTypeForUser = new Map<string, any[]>();
        arr.forEach(d => {
          const tid = d.type_id || 'unknown';
          if (!byTypeForUser.has(tid)) byTypeForUser.set(tid, []);
          byTypeForUser.get(tid)!.push(d);
        });
        const blocks = Array.from(byTypeForUser.keys())
          .sort((a,b)=> typeLabel(a).localeCompare(typeLabel(b)))
          .map(tid => {
            const items = byTypeForUser.get(tid)!
              .map(d => {
                const md = d?.metadata || {};
                const dtStr = md.issue_date || md.publication_date || d.created_at || '';
                const year = dtStr ? String(dtStr).slice(0,4) : '-';
                const title = (d.title || '').toString().replace(/</g,'&lt;');
                return `<li>${title} <span style=\"color:#666\">(${year})</span></li>`;
              }).join('');
            return `<div><h4 style=\"margin:6px 0\">${typeLabel(tid)}</h4><ul>${items}</ul></div>`;
          }).join('');
        return `<div class=\"faculty\"><h3>${name}</h3>${blocks}</div>`;
      }).join('')}
      `;

      const headerMeta: string[] = [];
      if (department) headerMeta.push(`Department: ${department.toUpperCase()}`);
      if (status) headerMeta.push(`Status: ${status === 'under_review' ? 'Under Review' : 'Published'}`);
      if (dateFrom || dateTo) headerMeta.push(`Issue Date: ${dateFrom || '...'} to ${dateTo || '...'}`);

      // Build PDF preview with pdf-lib
      const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const pageSize: [number, number] = [595.28, 841.89];
      const margin = 40;
      const line = 14;
      const addPage = () => pdf.addPage(pageSize);
      let page = addPage();
      let y = page.getHeight() - margin;
      const draw = (t: string, size = 11) => {
        const lines = t.split('\n');
        for (const ln of lines) {
          if (y < margin + line) { page = addPage(); y = page.getHeight() - margin; }
          page.drawText(ln, { x: margin, y, size, font, color: rgb(0,0,0) });
          y -= line;
        }
      };
      const drawTable = (headers: string[], rows: string[][], widths: number[]) => {
        const x0 = margin;
        const cellSize = 10;
        const vPad = 5;
        const lineGap = 12; // per wrapped line
        const wrap = (text: string, maxWidth: number, useBold = false) => {
          const f = useBold ? bold : font;
          const pad = 12; // left+right padding inside cell
          const limit = Math.max(10, maxWidth - pad);
          const lines: string[] = [];
          const tokens = sanitizePdfText(text)
            .split(/(\s+|\/|\-|—)/) // keep separators
            .filter(t => t !== undefined && t !== '');
          let cur = '';
          const flush = () => { if (cur) { lines.push(cur); cur = ''; } };
          const tokenWidth = (s: string) => f.widthOfTextAtSize(s, cellSize);
          for (const t of tokens) {
            const attempt = cur ? cur + t : t; // keep exact separators
            if (tokenWidth(attempt) <= limit) { cur = attempt; continue; }
            // If single token itself is too wide, split by characters
            if (!cur) {
              let piece = '';
              for (const ch of t) {
                const test = piece + ch;
                if (tokenWidth(test) > limit) { lines.push(piece); piece = ch; }
                else piece = test;
              }
              cur = piece; // remaining part for next tokens
            } else {
              flush();
              // reprocess token on next line
              if (tokenWidth(t) > limit) {
                let piece = '';
                for (const ch of t) {
                  const test = piece + ch;
                  if (tokenWidth(test) > limit) { lines.push(piece); piece = ch; }
                  else piece = test;
                }
                cur = piece;
              } else {
                cur = t;
              }
            }
          }
          if (cur) lines.push(cur);
          return lines;
        };
        const ensureSpace = (needed: number) => {
          if (y - needed < margin) { page = addPage(); y = page.getHeight() - margin; }
        };
        // Header row
        let headerLinesPerCol = headers.map((h,i)=> wrap(h, widths[i], true).length || 1);
        let headerRowH = Math.max(...headerLinesPerCol) * lineGap + vPad*2;
        ensureSpace(headerRowH);
        let x = x0;
        headers.forEach((h,i)=>{
          // border
          page.drawRectangle({ x, y: y - headerRowH, width: widths[i], height: headerRowH, borderColor: rgb(0.8,0.8,0.8), color: undefined, borderWidth: 1 });
          const lines = wrap(h, widths[i], true);
          let ty = y - vPad - cellSize; // start inside cell
          lines.forEach(ln => { page.drawText(ln, { x: x + 6, y: ty, size: cellSize, font: bold }); ty -= lineGap; });
          x += widths[i];
        });
        y -= headerRowH;
        // Body rows
        rows.forEach(r => {
          const linesPerCol = r.map((val,i)=> wrap(val, widths[i], false).length || 1);
          const rowH = Math.max(...linesPerCol) * lineGap + vPad*2;
          ensureSpace(rowH);
          let cx = x0;
          r.forEach((val, i) => {
            page.drawRectangle({ x: cx, y: y - rowH, width: widths[i], height: rowH, borderColor: rgb(0.8,0.8,0.8), color: undefined, borderWidth: 1 });
            const lines = wrap(val, widths[i], false);
            let ty = y - vPad - cellSize;
            lines.forEach(ln => { page.drawText(ln, { x: cx + 6, y: ty, size: cellSize, font }); ty -= lineGap; });
            cx += widths[i];
          });
          y -= rowH;
        });
      };

      draw('Analysis Report', 18);
      draw(headerMeta.join(' • ') || 'All documents');
      draw(`Total documents: ${total}`);
      y -= 6;
      draw('Counts by Type', 14);
      const countsRows = Array.from(byType.entries())
        .sort((a,b)=> typeLabel(a[0]).localeCompare(typeLabel(b[0])))
        .map(([t,n]) => [typeLabel(t), String(n)]);
      if (countsRows.length > 0) {
        drawTable(['Type','Count'], countsRows, [250,100]);
        y -= 16; // larger gap after table
      } else {
        draw('None');
      }
      y -= 8;
      draw('Documents per Faculty', 14);
      y -= 6;
      const perFacRows: string[][] = [];
      userKeys.forEach(uid => {
        const name = (usersById.get(uid)?.full_name || 'Unknown');
        const arr = byUser.get(uid)!;
        const counts = new Map<string, number>();
        arr.forEach(d => counts.set(d.type_id, (counts.get(d.type_id) || 0) + 1));
        Array.from(counts.keys()).sort((a,b)=> typeLabel(a).localeCompare(typeLabel(b))).forEach(tid => {
          perFacRows.push([name, typeLabel(tid), String(counts.get(tid) || 0)]);
        });
      });
      if (perFacRows.length > 0) { drawTable(['Name','Type','Count'], perFacRows, [220,180,80]); y -= 16; }
      y -= 8;
      draw('Faculty-wise Document List', 14);
      y -= 6;
      const docRows: string[][] = [];
      userKeys.forEach(uid => {
        const name = (usersById.get(uid)?.full_name || 'Unknown');
        const arr = byUser.get(uid)!;
        arr.forEach(d => {
          const md = d?.metadata || {};
          const dtStr = md.issue_date || md.publication_date || d.created_at || '';
          const year = dtStr ? String(dtStr).slice(0,4) : '-';
          docRows.push([name, typeLabel(d.type_id), (d.title || '').toString(), year]);
        });
      });
      docRows.sort((a,b)=> (a[0]||'').localeCompare(b[0]||'') || (a[1]||'').localeCompare(b[1]||'') || (a[2]||'').localeCompare(b[2]||''));
      if (docRows.length > 0) { drawTable(['Name','Type','Title','Year'], docRows, [160,120,210,60]); y -= 8; }

      const bytes = await pdf.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setAnalysisPdfUrl(url);
      setAnalysisOpen(true);
    } catch (e) {
      console.error('Analysis generation failed', e);
      alert('Failed to generate analysis.');
    } finally {
      setLoading(false);
    }
  };

  const loadPdfLib = (): Promise<any> => new Promise((resolve, reject) => {
    const w = window as any;
    if (w.PDFLib) return resolve(w.PDFLib);
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
    s.async = true;
    s.onload = () => resolve((window as any).PDFLib);
    s.onerror = reject;
    document.head.appendChild(s);
  });

  const generateCombinedPdf = async () => {
    const items = rows
      .map((p, idx) => ({ idx: idx + 1, title: p.title || '', issue: (p.issue_date as string) || '-', url: (p.file_url || '').toLowerCase().endsWith('.pdf') ? (p.file_url as string) : '' }))
      .filter(p => p.url);
    if (items.length === 0) return;
    setLoading(true);
    try {
      const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
      const merged = await PDFDocument.create();
      const font = await merged.embedFont(StandardFonts.Helvetica);
      // Cover page
      const addPage = () => merged.addPage([595.28, 841.89]);
      let page = addPage();
      let y = 800;
      const drawText = (text: string, x: number, y0: number, size = 12) => page.drawText(text, { x, y: y0, size, font, color: rgb(0,0,0) });
      drawText('Research Report', 50, y, 24); y -= 24;
      const metaParts: string[] = [];
      if (department) metaParts.push(`Department: ${department.toUpperCase()}`);
      if (status) metaParts.push(`Status: ${status === 'under_review' ? 'Under Review' : 'Published'}`);
      if (dateFrom || dateTo) metaParts.push(`Issue Date: ${dateFrom || '...'} to ${dateTo || '...'}`);
      y -= 12;
      drawText(metaParts.join(' • ') || 'All papers', 50, y); y -= 24;
      drawText('#   Title                                       Issue Date', 50, y); y -= 14;
      const newLine = () => { y -= 14; if (y < 60) { page = addPage(); y = 800; } };
      items.forEach(it => {
        const idxStr = String(it.idx).padEnd(3, ' ');
        const ttl = (it.title || '').slice(0, 40).padEnd(42, ' ');
        drawText(`${idxStr} ${ttl} ${it.issue}`, 50, y);
        newLine();
      });

      for (const it of items) {
        const resp = await fetch(it.url, { mode: 'cors' });
        const buf = await resp.arrayBuffer();
        const src = await PDFDocument.load(buf);
        const copied = await merged.copyPages(src, src.getPageIndices());
        copied.forEach(p => merged.addPage(p));
      }

      const bytes = await merged.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'research-report.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error('Combined PDF error', e);
      alert('Failed to generate combined PDF.');
    } finally {
      setLoading(false);
    }
  };

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

  const fetchData = async () => {
    setLoading(true);
    try {
      const hasMultiUsers = selectedUserIds.length > 0;
      const sp = new URLSearchParams(location.search);
      const scopeMe = sp.get('scope') === 'me';
      const isPriv = role === 'admin' || role === 'hod';
      const myScope = scopeMe || !isPriv;
      if ((docType === 'any' || docType === 'research_paper') && !hasMultiUsers && userId === 'all' && !myScope) {
        const { data } = await listPapers(
          { department: department || undefined as any, status: status || undefined as any },
          { page: 1, pageSize: 1000, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, sortBy: 'issue_date', sortDir: 'desc' }
        );
        setRows(data || []);
      } else {
        // Fetch from documents for selected type(s) and map to ResearchPaper-like rows
        let q = supabase.from('documents').select('*').order('created_at', { ascending: false });
        if (docType !== 'any') q = q.eq('type_id', docType);
        if (status) q = q.eq('status', status);
        if (hasMultiUsers) q = q.in('created_by', selectedUserIds);
        else if (userId !== 'all') q = q.eq('created_by', userId);
        if (myScope && user?.id) {
          const { data: da } = await supabase
            .from('document_authors')
            .select('document_id')
            .eq('user_id', user.id);
          const ids = ((da || []) as any[]).map(r => r.document_id).filter(Boolean);
          if (ids.length > 0) {
            const idsCsv = ids.map((x: string) => `"${x}"`).join(',');
            q = q.or(`created_by.eq.${user.id},id.in.(${idsCsv})`);
          } else {
            q = q.eq('created_by', user.id);
          }
        }
        const { data, error } = await q;
        let docs = (data || []) as any[];
        // Date filter based on metadata.issue_date/publication_date
        const from = dateFrom ? new Date(dateFrom) : null;
        const to = dateTo ? new Date(dateTo) : null;
        const filtered = docs.filter(d => {
          const md = d?.metadata || {};
          const dtStr = md.issue_date || md.publication_date || d.created_at;
          if (!dtStr) return !from && !to;
          const dt = new Date(dtStr);
          if (from && dt < from) return false;
          if (to && dt > to) return false;
          if (department && String(md.department || '').toLowerCase() !== String(department).toLowerCase()) return false;
          return true;
        });
        // Sort by issue/publication date descending by default
        filtered.sort((a,b)=>{
          const ma = a?.metadata || {}; const mb = b?.metadata || {};
          const da = new Date(ma.issue_date || ma.publication_date || a.created_at || 0).getTime();
          const db = new Date(mb.issue_date || mb.publication_date || b.created_at || 0).getTime();
          return db - da;
        });
        const mapped: ResearchPaper[] = filtered.map(d => ({
          id: d.id,
          title: d.title,
          issue_date: (d.metadata?.issue_date as string) || (d.metadata?.publication_date as string) || null,
          file_url: d.file_url,
          status: d.status,
          authors: [],
          department: null,
        } as unknown as ResearchPaper));
        setRows(mapped);
      }
    } finally {
      setLoading(false);
    }
  };

  // Build analytics from documents using the same filters
  const fetchCharts = async () => {
    // Query documents with filters consistent with generateAnalysis
    let q = supabase
      .from('documents')
      .select('id,title,type_id,created_by,created_at,status,metadata')
      .order('created_at', { ascending: true });
    if (docType !== 'any') q = q.eq('type_id', docType);
    if (status) q = q.eq('status', status);
    if (selectedUserIds.length > 0) q = q.in('created_by', selectedUserIds);
    else if (userId !== 'all') q = q.eq('created_by', userId);
    // Scope for non-admins
    const sp2 = new URLSearchParams(location.search);
    const scopeMe2 = sp2.get('scope') === 'me';
    const isPriv2 = role === 'admin' || role === 'hod';
    const myScope2 = scopeMe2 || !isPriv2;
    if (myScope2 && user?.id) {
      const { data: da } = await supabase
        .from('document_authors')
        .select('document_id')
        .eq('user_id', user.id);
      const ids = ((da || []) as any[]).map(r => r.document_id).filter(Boolean);
      if (ids.length > 0) {
        const idsCsv = ids.map((x: string) => `"${x}"`).join(',');
        q = q.or(`created_by.eq.${user.id},id.in.(${idsCsv})`);
      } else {
        q = q.eq('created_by', user.id);
      }
    }
    const { data } = await q;
    let docs = (data || []) as any[];
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : null;
    docs = docs.filter(d => {
      const md = d?.metadata || {};
      const dtStr = md.issue_date || md.publication_date || d.created_at;
      const depStr = (md.department || md.department_text || '').toString().toLowerCase();
      if (department && depStr !== department.toLowerCase()) return false;
      if (!dtStr) return !(from || to);
      const dt = new Date(dtStr);
      if (from && dt < from) return false;
      if (to && dt > to) return false;
      return true;
    });

    // Exclude disabled users' docs
    const activeIdSet = new Set((users || []).map(u => u.id));
    docs = docs.filter(d => !d.created_by || activeIdSet.has(d.created_by));

    // Area: monthly totals
    const monthKey = (s: string) => { const d = new Date(s); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
    const areaMap = new Map<string, number>();
    docs.forEach(d => {
      const md = d?.metadata || {}; const ds = md.issue_date || md.publication_date || d.created_at;
      const k = monthKey(ds);
      areaMap.set(k, (areaMap.get(k) || 0) + 1);
    });
    const areaArr = Array.from(areaMap.entries()).map(([bucket, total]) => ({ bucket, total })).sort((a,b)=> a.bucket.localeCompare(b.bucket));
    setAreaData(areaArr);

    // Pie: by type
    const typeLabel = (t: string) => t === 'research_paper' ? 'Research Paper' : t === 'patent' ? 'Patent' : t === 'certificate' ? 'Certificate' : t === 'conference_paper' ? 'Conference' : t || 'Other';
    const pieMap = new Map<string, number>();
    docs.forEach(d => pieMap.set(typeLabel(d.type_id), (pieMap.get(typeLabel(d.type_id)) || 0) + 1));
    setPieData(Array.from(pieMap.entries()).map(([name, value]) => ({ name, value })));

    // Bar: user-wise uploads
    const nameById = new Map(users.map(u => [u.id, u.full_name] as const));
    const barMap = new Map<string, number>();
    docs.forEach(d => { const n = nameById.get(d.created_by) || 'Unknown'; barMap.set(n, (barMap.get(n)||0)+1); });
    const barArr = Array.from(barMap.entries()).map(([name, value]) => ({ name, value }))
      .sort((a,b)=> b.value - a.value).slice(0, 12);
    setBarData(barArr);

    // Department comparison stacked by month (top 5 departments + Other)
    const depMonth = new Map<string, Map<string, number>>(); // month -> dept -> count
    docs.forEach(d => {
      const md = d?.metadata || {};
      const ds = md.issue_date || md.publication_date || d.created_at;
      const m = monthKey(ds);
      const dep = String(md.department || md.department_text || 'Unknown').toUpperCase();
      if (!depMonth.has(m)) depMonth.set(m, new Map());
      const mm = depMonth.get(m)!;
      mm.set(dep, (mm.get(dep) || 0) + 1);
    });
    const depTotals = new Map<string, number>();
    depMonth.forEach(map => map.forEach((n, dep) => depTotals.set(dep, (depTotals.get(dep) || 0) + n)));
    const top = Array.from(depTotals.entries()).sort((a,b)=> b[1]-a[1]).slice(0,5).map(([k])=>k);
    const keys = [...top, 'OTHER'];
    const rows = Array.from(depMonth.keys()).sort().map(m => {
      const mm = depMonth.get(m)!;
      const row: Record<string, any> = { month: m };
      let other = 0;
      mm.forEach((n, dep) => { if (top.includes(dep)) row[dep] = n; else other += n; });
      row['OTHER'] = other;
      keys.forEach(k => { if (row[k] == null) row[k] = 0; });
      return row;
    });
    setDeptKeys(keys);
    setDeptStack(rows);
  };

  // Auto-refresh charts on filter change and on Load
  useEffect(() => { fetchCharts(); /* eslint-disable-next-line */ }, [department, status, dateFrom, dateTo, docType, users]);

  const generatePdf = async () => {
    await ensureDataLoaded();
    const filtered = rows;
    const typeTitle = docType === 'any' || docType === 'research_paper' ? 'Research Papers' :
      docType === 'patent' ? 'Patents' : docType === 'certificate' ? 'Certificates' : 'Conference Papers';
    const title = `${typeTitle} Report`;
    const meta: string[] = [];
    if (department) meta.push(`Department: ${department.toUpperCase()}`);
    if (status) meta.push(`Status: ${status === 'under_review' ? 'Under Review' : 'Published'}`);
    if (dateFrom || dateTo) meta.push(`Issue Date: ${dateFrom || '...'} to ${dateTo || '...'}`);

    setLoading(true);
    try {
      const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const pageSize: [number, number] = [595.28, 841.89];
      const margin = 40;
      const lineHeight = 14;
      const titleSize = 18;
      const textSize = 11;
      const addPage = () => pdf.addPage(pageSize);
      let page = addPage();
      let y = page.getHeight() - margin;
      const drawText = (txt: string, size = textSize) => {
        const lines = txt.split('\n');
        lines.forEach((ln) => {
          if (y < margin + lineHeight) { page = addPage(); y = page.getHeight() - margin; }
          page.drawText(ln, { x: margin, y, size, font, color: rgb(0,0,0) });
          y -= lineHeight;
        });
      };
      const drawTable = (headers: string[], rows: string[][], widths: number[], rowH = 18) => {
        const x0 = margin;
        const cellSize = 9; // smaller to fit more content
        const vPad = 5;
        const lineGap = 11;
        const wrap = (text: string, maxWidth: number, useBold = false, maxLines?: number) => {
          const f = useBold ? bold : font;
          const pad = 12;
          const limit = Math.max(10, maxWidth - pad);
          const lines: string[] = [];
          const tokens = sanitizePdfText(text)
            .split(/(\s+|\/|\-|—)/)
            .filter(t => t !== undefined && t !== '');
          let cur = '';
          const flush = () => { if (cur) { lines.push(cur); cur = ''; } };
          const tokenWidth = (s: string) => f.widthOfTextAtSize(s, cellSize);
          for (const t of tokens) {
            const attempt = cur ? cur + t : t;
            if (tokenWidth(attempt) <= limit) { cur = attempt; continue; }
            if (!cur) {
              let piece = '';
              for (const ch of t) {
                const test = piece + ch;
                if (tokenWidth(test) > limit) { lines.push(piece); piece = ch; }
                else piece = test;
              }
              cur = piece;
            } else {
              flush();
              if (tokenWidth(t) > limit) {
                let piece = '';
                for (const ch of t) {
                  const test = piece + ch;
                  if (tokenWidth(test) > limit) { lines.push(piece); piece = ch; }
                  else piece = test;
                }
                cur = piece;
              } else {
                cur = t;
              }
            }
            if (maxLines && lines.length >= maxLines - 1) {
              // Fill last line with remaining truncated text + ellipsis
              const remaining = (cur + tokens.slice(tokens.indexOf(t) + 1).join('')) || cur;
              let last = '';
              for (const ch of remaining) {
                const test = last + ch;
                if (tokenWidth(test + '…') > limit) break;
                last = test;
              }
              if (last) lines.push(last + '…');
              cur = '';
              break;
            }
          }
          if (cur) lines.push(cur);
          return lines;
        };
        const drawCell = (text: string, x: number, w: number, isHeader=false, colIdx=0) => {
          const maxLines = isHeader ? undefined : (colIdx === 1 ? 4 : 1); // Title up to 4 lines, others 1
          const lines = wrap(text, w, isHeader, maxLines);
          const rowHeight = Math.max(18, lines.length * lineGap + vPad*2);
          if (y - rowHeight < margin) { page = addPage(); y = page.getHeight() - margin; }
          page.drawRectangle({ x, y: y - rowHeight, width: w, height: rowHeight, borderColor: rgb(0.8,0.8,0.8), color: undefined, borderWidth: 1 });
          const tFont = isHeader ? bold : font;
          let ty = y - vPad - cellSize;
          lines.forEach(ln => { page.drawText(ln, { x: x + 6, y: ty, size: cellSize, font: tFont, color: rgb(0,0,0) }); ty -= lineGap; });
          return rowHeight;
        };
        // header
        let x = x0;
        const headerHeights = widths.map((w,i)=> drawCell(headers[i] || '', x + widths.slice(0,i).reduce((a,b)=>a+b,0), w, true, i));
        y -= Math.max(...headerHeights);
        // rows
        rows.forEach(r => {
          let cx = x0;
          const heights: number[] = [];
          r.forEach((val, i) => { heights.push(drawCell(String(val ?? ''), cx, widths[i], false, i)); cx += widths[i]; });
          y -= Math.max(...heights);
        });
      };

      drawText(title, titleSize);
      drawText(meta.join(' • ') || 'All papers');
      y -= 6;
      const tableRows = filtered.map((p, idx) => [String(idx + 1), (p.title || '').toString(), (p.issue_date as string) || '-']);
      // widths sum to pageWidth - 2*margin (≈515): 30 + 385 + 100 = 515
      drawTable(['#','Title','Issue Date'], tableRows, [30, 385, 100]);
      y -= 12;

      const bytes = await pdf.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      setPdfPreviewOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const navigate = useNavigate();
  const onLogout = () => { logout(); navigate('/login'); };

  // View authorization: non-admin/HOD can access when scope=me
  const spView = new URLSearchParams(location.search);
  const scopeMeView = spView.get('scope') === 'me';
  const isPrivView = role === 'admin' || role === 'hod';
  const blocked = !!role && !isPrivView && !scopeMeView;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {blocked ? (
        <main className="container mx-auto py-16">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-semibold">Not authorized</h1>
            <p className="text-muted-foreground">This page is available to Admins and HODs only.</p>
            <Button asChild><Link to="/">Go Home</Link></Button>
          </div>
        </main>
      ) : (
      <main className="container mx-auto py-8 space-y-6">
        <h1 className="text-2xl font-semibold">Generate Report</h1>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <Label htmlFor="doctype">Document Type</Label>
            <Select value={docType} onValueChange={(v)=> setDocType(v as any)}>
              <SelectTrigger id="doctype">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="research_paper">Research Paper</SelectItem>
                <SelectItem value="patent">Patents</SelectItem>
                <SelectItem value="certificate">Certificates</SelectItem>
                <SelectItem value="conference_paper">Conference</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(role === 'admin' || role === 'hod') && (
            <div>
              <Label htmlFor="usr">User</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    {selectedUserIds.length === 0 ? 'All Users' : `${selectedUserIds.length} selected`}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-72 p-2" align="end">
                  <Input
                    id="usr"
                    placeholder="Search user"
                    value={userQuery}
                    onChange={(e)=> setUserQuery(e.target.value)}
                    className="mb-2 h-8"
                    onKeyDown={(e)=> e.stopPropagation()}
                  />
                  <div className="max-h-64 overflow-auto">
                    <label className="flex items-center gap-2 px-2 py-1 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.length === users.length && users.length > 0}
                        onChange={(e)=> setSelectedUserIds(e.target.checked ? users.map(u=>u.id) : [])}
                        onClick={(e)=> e.stopPropagation()}
                      />
                      All Users
                    </label>
                    <div className="h-px bg-border my-1" />
                    {users
                      .filter(u => (u.full_name || '').toLowerCase().includes(userQuery.toLowerCase()))
                      .map(u => (
                        <label key={u.id} className="flex items-center gap-2 px-2 py-1 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedUserIds.includes(u.id)}
                            onChange={(e)=> {
                              setSelectedUserIds(prev => e.target.checked ? Array.from(new Set([...prev, u.id])) : prev.filter(id => id !== u.id));
                            }}
                            onClick={(e)=> e.stopPropagation()}
                          />
                          {u.full_name}
                        </label>
                      ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 px-2">Tip: leave empty to include everyone or tick specific users.</p>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          <div>
            <Label htmlFor="from">Date of Issue (From)</Label>
            <Input id="from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="to">Date of Issue (To)</Label>
            <Input id="to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={()=>{ fetchData(); fetchCharts(); }} disabled={loading}>Load</Button>
          <Button onClick={generatePdf} variant="secondary" disabled={loading}>Generate PDF</Button>
          <Button onClick={generateAnalysis} variant="outline" disabled={loading}>Generate Analysis</Button>
        </div>

        {/* Analytics (uses same filters) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border bg-card p-4">
            <h3 className="font-semibold mb-3">Uploads Over Time</h3>
            <AreaChart width={600} height={260} data={areaData} className="w-full">
              <defs>
                <linearGradient id="colorR" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucket" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Area type="monotone" dataKey="total" stroke="#3b82f6" fillOpacity={1} fill="url(#colorR)" />
            </AreaChart>
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
        {/* Department comparison stacked chart */}
        {deptStack.length > 0 && (
          <div className="rounded-xl border bg-card p-4">
            <h3 className="font-semibold mb-3">Department Comparison (Monthly)</h3>
            <BarChart width={1000} height={320} data={deptStack} className="w-full">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              {deptKeys.map((k, idx) => (
                <Bar key={k} dataKey={k} stackId="a" fill={["#2563eb","#16a34a","#f59e0b","#ef4444","#8b5cf6","#6b7280"][idx % 6]} />
              ))}
              <Legend />
            </BarChart>
          </div>
        )}
        <div className="grid grid-cols-1 gap-6">
          <div className="rounded-xl border bg-card p-4">
            <h3 className="font-semibold mb-3">By Document Type</h3>
            <PieChart width={600} height={280} className="w-full">
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                {pieData.map((entry, index) => (
                  <Cell key={`c-${index}`} fill={["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4"][index % 6]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </div>
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Year</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p, i) => (
                <TableRow key={p.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell>{typeof p.issue_date === 'string' && p.issue_date ? String(p.issue_date).slice(0,4) : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </main>
      )}
      {/* Analysis Preview (PDF) */}
      <Dialog open={analysisOpen} onOpenChange={(o)=>{ if(!o && analysisPdfUrl){ URL.revokeObjectURL(analysisPdfUrl); setAnalysisPdfUrl(null);} setAnalysisOpen(o); }}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Analysis Preview</DialogTitle>
          </DialogHeader>
          {analysisPdfUrl ? (
            <div className="border rounded" style={{height:'60vh'}}>
              <iframe title="analysis" className="w-full h-full" src={analysisPdfUrl} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No analysis ready</p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => { if (analysisPdfUrl) window.open(analysisPdfUrl, '_blank'); }}>Open in New Tab</Button>
            <Button onClick={() => { if (!analysisPdfUrl) return; const a = document.createElement('a'); a.href = analysisPdfUrl; a.download = 'analysis-report.pdf'; document.body.appendChild(a); a.click(); a.remove(); }}>Download PDF</Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Report PDF Preview */}
      <Dialog open={pdfPreviewOpen} onOpenChange={(o)=>{ if(!o && pdfUrl){ URL.revokeObjectURL(pdfUrl); setPdfUrl(null);} setPdfPreviewOpen(o); }}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>PDF Preview</DialogTitle>
          </DialogHeader>
          {pdfUrl ? (
            <div className="border rounded" style={{height:'60vh'}}>
              <iframe title="report" className="w-full h-full" src={pdfUrl} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No PDF ready</p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => { if (pdfUrl) window.open(pdfUrl, '_blank'); }}>Open in New Tab</Button>
            <Button onClick={() => { if (!pdfUrl) return; const a = document.createElement('a'); a.href = pdfUrl; a.download = 'report.pdf'; document.body.appendChild(a); a.click(); a.remove(); }}>Download PDF</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Report;
