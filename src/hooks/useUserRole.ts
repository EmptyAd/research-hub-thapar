import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabaseClient';

export type UserRole = 'admin' | 'hod' | 'user' | null;

export const useUserRole = () => {
  const { user } = useAuth();
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRole = async () => {
      if (!user?.id) {
        setRole(null);
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        if (error) {
          console.error('Error fetching role:', error);
          setRole('user');
        } else {
          setRole(((data as any)?.role as UserRole) ?? 'user');
        }
      } catch (err) {
        console.error('Error:', err);
        setRole('user');
      } finally {
        setLoading(false);
      }
    };
    fetchRole();
  }, [user?.id]);

  return { role, loading, isAdmin: role === 'admin', isUser: role === 'user', isHod: role === 'hod' };
};
