import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Bell } from 'lucide-react';
import { AnnouncementBadge } from '@/components/AnnouncementBadge';
import { useUserRole } from '@/hooks/useUserRole';

const ANNOUNCEMENT_TYPES = [
  { value: 'info', label: 'Info', color: '#2b90d9' },
  { value: 'warning', label: 'Warning', color: '#f2a900' },
  { value: 'system', label: 'System', color: '#c41c00' },
];

export function NotificationBell() {
  const { user } = useAuth();
  const { isAdmin, isHod } = useUserRole();
  const [open, setOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [reads, setReads] = useState<Record<string, boolean>>({});
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [announceType, setAnnounceType] = useState('info');
  const [announceContent, setAnnounceContent] = useState('');
  const [announceExpiresAt, setAnnounceExpiresAt] = useState<string>('');
  const [announceLoading, setAnnounceLoading] = useState(false);
  const [announceError, setAnnounceError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    async function load() {
      // Cleanup expired announcements globally (best-effort, admin/HOD only)
      try {
        if (isAdmin || isHod) {
          await supabase.from('announcements').delete().lte('expires_at', new Date().toISOString());
        }
      } catch {}
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data: anns } = await supabase
        .from('announcements')
        .select('*')
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (!anns) return;
      const ids = anns.map((a: any) => a.id);
      const { data: rds } = await supabase
        .from('announcement_reads')
        .select('announcement_id')
        .eq('user_id', user.id)
        .in('announcement_id', ids);
      if (!active) return;
      setAnnouncements(anns);
      setReads(Object.fromEntries((rds || []).map((r: any) => [r.announcement_id, true])));
    }
    if (open) load();
    return () => { active = false; };
  }, [user?.id, open]);

  // Close on outside click or escape
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const markRead = async (announcementId: string) => {
    await supabase.from('announcement_reads').insert({ announcement_id: announcementId, user_id: user.id });
    setReads(r => ({ ...r, [announcementId]: true }));
  };

  // Use canonical role detection from users table + safe email fallback
  const emailFallbackAdmins = new Set([
    'admin@thapar.edu',
    'hod@thapar.edu',
    'avisrivastava@thapar.edu',
    'nitin.saxena@thapar.edu'
  ]);
  const canAnnounce = !!(isAdmin || isHod || (user?.email && emailFallbackAdmins.has(user.email)));
  return (
    <div style={{ position: 'relative', display: 'inline-block' }} ref={ref}>
      <button aria-label="Notifications" className="inline-flex items-center justify-center h-10 w-10 rounded-full hover:bg-white/10" onClick={() => setOpen(v => !v)}>
        <Bell className="h-5 w-5" />
        <AnnouncementBadge />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '110%', right: 0, zIndex: 1000, background: 'white', border: '1px solid #eee', borderRadius: 8, boxShadow: '0 4px 24px #0001', width: 360, maxHeight: 500, overflowY: 'auto', padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'black' }}>
            Notifications
            {canAnnounce && (
              <button style={{ fontSize: 14, padding: '4px 14px', borderRadius: 6, background: '#2b90d9', color: 'white', border: 0, fontWeight: 600 }} onClick={() => setAnnounceOpen(true)}>
                Send Notification
              </button>
            )}
          </div>
          {announceOpen && canAnnounce && (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.18)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <form onSubmit={async e => {
                e.preventDefault();
                setAnnounceLoading(true); setAnnounceError(null);
                const { error } = await supabase.from('announcements').insert({
                  sender_id: user.id,
                  content: announceContent,
                  type: announceType,
                  expires_at: announceExpiresAt ? new Date(announceExpiresAt).toISOString() : null,
                  department: null,
                });
                if (error) { setAnnounceError(error.message); setAnnounceLoading(false); return; }
                setAnnounceOpen(false); setAnnounceContent(''); setAnnounceType('info'); setAnnounceExpiresAt(''); setAnnounceLoading(false);
                setTimeout(() => window.location.reload(), 500);
              }} style={{ background: 'white', borderRadius: 10, padding: 24, minWidth: 320, maxWidth: 400, boxShadow: '0 8px 32px #0003', position: 'relative' }}>
                <button type="button" onClick={() => setAnnounceOpen(false)} style={{ position: 'absolute', top: 8, right: 12, background: 'none', border: 0, fontSize: 22, color: '#888', cursor: 'pointer' }}>&times;</button>
                <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 10, color: 'black' }}>Send Notification</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <select value={announceType} onChange={e => setAnnounceType(e.target.value)} style={{ borderRadius: 6, border: '1px solid #ccc', padding: 4, color: 'black', background: 'white' }}>
                    {ANNOUNCEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <textarea value={announceContent} onChange={e => setAnnounceContent(e.target.value)} placeholder="Announcement..." required style={{ width: '100%', borderRadius: 6, border: '1px solid #ccc', padding: 6, marginBottom: 8, color: 'black', background: 'white' }} />
                <div style={{ marginBottom: 12, color: 'black' }}>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Expiry (optional)</label>
                  <input type="datetime-local" value={announceExpiresAt} onChange={e => setAnnounceExpiresAt(e.target.value)} style={{ borderRadius: 6, border: '1px solid #ccc', padding: 6, width: '100%', color: 'black', background: 'white' }} />
                </div>
                <button type="submit" disabled={announceLoading} style={{ background: '#dc2626', color: 'white', borderRadius: 6, padding: '6px 16px', border: 0, fontWeight: 600 }}>Send</button>
                {announceError && <div style={{ color: 'red', fontSize: 12 }}>{announceError}</div>}
              </form>
            </div>
          )}
          {announcements.length === 0 && <div style={{ color: 'black' }}>No notifications yet.</div>}
          {announcements.map(a => (
            <div key={a.id} style={{ margin: '12px 0', padding: 10, borderRadius: 6, background: reads[a.id] ? '#f6f6f6' : '#fffbe6', borderLeft: `4px solid ${ANNOUNCEMENT_TYPES.find(t => t.value === (a.type || 'info'))?.color || '#2b90d9'}`, color: 'black' }}>
              <div style={{ fontWeight: 500, display: 'flex', gap: 8, alignItems: 'center', color: 'black' }}>
                <span style={{ color: ANNOUNCEMENT_TYPES.find(t => t.value === (a.type || 'info'))?.color || '#2b90d9', fontWeight: 700, fontSize: 13 }}>{(ANNOUNCEMENT_TYPES.find(t => t.value === (a.type || 'info'))?.label || 'Info')}</span>
                <span>{a.content}</span>
              </div>
              <div style={{ fontSize: 11, color: 'black', marginBottom: 4 }}>{new Date(a.created_at).toLocaleString()}</div>
              {!reads[a.id] && <button onClick={() => markRead(a.id)} style={{ fontSize: 12, marginTop: 4 }}>Mark as read</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
