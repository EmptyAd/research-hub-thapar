import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export function MessagesPanel() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    async function loadConvos() {
      // Find users who have messaged or been messaged by this user
      const { data: sent } = await supabase
        .from('messages')
        .select('recipient_id')
        .eq('sender_id', user.id);
      const { data: received } = await supabase
        .from('messages')
        .select('sender_id')
        .eq('recipient_id', user.id);
      const ids = Array.from(new Set([
        ...(sent || []).map((m: any) => m.recipient_id),
        ...(received || []).map((m: any) => m.sender_id)
      ])).filter((id: string) => id !== user.id);
      if (ids.length === 0) { setConversations([]); return; }
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, email')
        .in('id', ids);
      if (active) setConversations(users || []);
    }
    loadConvos();
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!selected || !user?.id) return;
    let active = true;
    async function loadMessages() {
      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .or(`sender_id.eq.${selected},recipient_id.eq.${selected}`)
        .order('created_at', { ascending: true });
      if (active) setMessages(msgs || []);
    }
    loadMessages();
    return () => { active = false; };
  }, [selected, user?.id]);

  const sendMessage = async () => {
    if (!selected || !input.trim()) return;
    await supabase.from('messages').insert({ sender_id: user.id, recipient_id: selected, content: input.trim() });
    setInput('');
    // Reload messages
    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .or(`sender_id.eq.${selected},recipient_id.eq.${selected}`)
      .order('created_at', { ascending: true });
    setMessages(msgs || []);
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24, display: 'flex', gap: 24 }}>
      <div style={{ minWidth: 180, borderRight: '1px solid #eee', paddingRight: 16 }}>
        <h3>Conversations</h3>
        {conversations.map(u => (
          <div key={u.id} style={{ padding: 8, cursor: 'pointer', background: selected === u.id ? '#f0f0f0' : undefined }} onClick={() => setSelected(u.id)}>
            {u.full_name || u.email}
          </div>
        ))}
        {conversations.length === 0 && <div>No conversations yet.</div>}
      </div>
      <div style={{ flex: 1 }}>
        {selected ? (
          <>
            <div style={{ minHeight: 320, maxHeight: 400, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              {messages.map(m => (
                <div key={m.id} style={{ textAlign: m.sender_id === user.id ? 'right' : 'left', margin: '8px 0' }}>
                  <span style={{ display: 'inline-block', background: m.sender_id === user.id ? '#d1e7ff' : '#f1f1f1', borderRadius: 8, padding: '6px 12px' }}>{m.content}</span>
                  <div style={{ fontSize: 10, color: '#888' }}>{new Date(m.created_at).toLocaleString()}</div>
                </div>
              ))}
              {messages.length === 0 && <div>No messages yet.</div>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={input} onChange={e => setInput(e.target.value)} style={{ flex: 1, borderRadius: 8, border: '1px solid #ccc', padding: 8 }} placeholder="Type a message..." />
              <button onClick={sendMessage} style={{ borderRadius: 8, padding: '8px 16px' }}>Send</button>
            </div>
          </>
        ) : <div>Select a conversation</div>}
      </div>
    </div>
  );
}
