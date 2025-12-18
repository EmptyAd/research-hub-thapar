import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://rimjzfwccfguowezxcyy.supabase.co';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);

if (!supabaseAnonKey || supabaseAnonKey === 'REPLACE_WITH_NEW_PROJECT_ANON_KEY') {
  console.warn('[supabase] Missing or placeholder anon key. Set VITE_SUPABASE_PUBLISHABLE_KEY in .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
});

// Expose for debugging in DevTools
// You can run: await window.supabase.auth.getSession();
// and: await window.supabase.auth.getUser();
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.supabase = supabase;
}
