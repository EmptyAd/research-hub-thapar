import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Bell } from 'lucide-react';

export function MessageBadge() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    let sub: any;
    // Initial unread fetch
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .eq('read', false)
      .then(({ count }) => setUnread(count ?? 0));
    // Realtime subscription
    sub = supabase
      .channel('messages:unread_' + user.id)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `recipient_id=eq.${user.id}` },
        payload => {
          // On any message change, re-count
          supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('recipient_id', user.id)
            .eq('read', false)
            .then(({ count }) => setUnread(count ?? 0));
        }
      )
      .subscribe();
    return () => { sub && supabase.removeChannel(sub); };
  }, [user?.id]);

  if (!user?.id || unread === 0) return null;
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <Bell size={20} />
      <span style={{ position: 'absolute', top: -4, right: -4, background: 'red', color: 'white', borderRadius: '50%', padding: '2px 6px', fontSize: 12 }}>{unread}</span>
    </span>
  );
}
