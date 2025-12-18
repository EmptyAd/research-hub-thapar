import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export function AnnouncementsPanel() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [reads, setReads] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    async function load() {
      const { data: anns } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false });
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
    load();
    return () => { active = false; };
  }, [user?.id]);

  const markRead = async (announcementId: string) => {
    await supabase.from('announcement_reads').insert({ announcement_id: announcementId, user_id: user.id });
    setReads(r => ({ ...r, [announcementId]: true }));
  };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 24 }}>
      <h2>Announcements</h2>
      {announcements.map(a => (
        <div key={a.id} style={{ margin: '16px 0', padding: 12, border: '1px solid #eee', borderRadius: 8, background: reads[a.id] ? '#f9f9f9' : '#fffbe6' }}>
          <div style={{ fontWeight: 600 }}>{a.content}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{new Date(a.created_at).toLocaleString()}</div>
          {!reads[a.id] && <button onClick={() => markRead(a.id)} style={{ marginTop: 8 }}>Mark as read</button>}
        </div>
      ))}
      {announcements.length === 0 && <div>No announcements yet.</div>}
    </div>
  );
}
