import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export function AnnouncementBadge() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    let sub: any;
    // Initial unread fetch
    supabase
      .from('announcements')
      .select('id')
      .then(async ({ data: anns }) => {
        if (!anns) return setUnread(0);
        // For each announcement, check if user has read
        const ids = anns.map(a => a.id);
        if (ids.length === 0) return setUnread(0);
        const { data: reads } = await supabase
          .from('announcement_reads')
          .select('announcement_id')
          .eq('user_id', user.id)
          .in('announcement_id', ids);
        setUnread(ids.length - (reads?.length || 0));
      });
    // Realtime subscription (optional, can use polling)
    sub = supabase
      .channel('announcements:unread_' + user.id)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'announcements' },
        () => {
          supabase
            .from('announcements')
            .select('id')
            .then(async ({ data: anns }) => {
              if (!anns) return setUnread(0);
              const ids = anns.map(a => a.id);
              if (ids.length === 0) return setUnread(0);
              const { data: reads } = await supabase
                .from('announcement_reads')
                .select('announcement_id')
                .eq('user_id', user.id)
                .in('announcement_id', ids);
              setUnread(ids.length - (reads?.length || 0));
            });
        }
      )
      .subscribe();
    return () => { sub && supabase.removeChannel(sub); };
  }, [user?.id]);

  if (!user?.id || unread === 0) return null;
  return (
    <span style={{ position: 'relative', display: 'inline-block', marginLeft: 8 }}>
      <span role="img" aria-label="announcement">📢</span>
      <span style={{ position: 'absolute', top: -4, right: -4, background: 'orange', color: 'white', borderRadius: '50%', padding: '2px 6px', fontSize: 12 }}>{unread}</span>
    </span>
  );
}
