import { supabase } from '@/utils/supabaseClient';
import { DEPARTMENT_VALUES } from '@/utils/auth';
import { logAudit } from '@/utils/audit';

export type Professor = {
  id: string;
  full_name: string;
  email: string;
  department: string | null;
};

export async function listProfessors() {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, department')
    .order('full_name', { ascending: true });
  if (error) return { error } as const;
  return { data: (data || []) as Professor[] } as const;
}

export async function updateUserProfile(params: { id: string; full_name: string; department: string | null; about?: string | null; }) {
  const deptRaw = (params.department || '').toLowerCase();
  const department = (DEPARTMENT_VALUES as readonly string[]).includes(deptRaw) ? deptRaw : null;
  const { error } = await supabase
    .from('users')
    // Store "about" text in specialization column per new requirement
    .update({ full_name: params.full_name, department, specialization: params.about ?? null })
    .eq('id', params.id);
  if (error) return { error } as const;
  await logAudit({ action: 'profile_update', entity_type: 'user', entity_id: params.id, metadata: { fields: ['full_name','department','specialization'] } });
  return { ok: true } as const;
}

export async function getUserRole(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (error) return { error } as const;
  return { role: (data as any)?.role as string | undefined } as const;
}

export async function ensureUserExists(params: { id?: string; email: string; full_name?: string; department?: string | null; }) {
  const email = params.email;
  const id = params.id;
  const full_name = params.full_name ?? email.split('@')[0];
  const deptRaw = (params.department || '').toLowerCase();
  const department = (DEPARTMENT_VALUES as readonly string[]).includes(deptRaw) ? deptRaw : null;

  // Try by id
  if (id) {
    const chk = await supabase.from('users').select('id').eq('id', id).maybeSingle();
    if (chk.data?.id) return { id: chk.data.id as string } as const;
  }

  // Try by email
  const byEmail = await supabase.from('users').select('id').eq('email', email).maybeSingle();
  if (byEmail.data?.id) return { id: byEmail.data.id as string } as const;

  // Insert minimal row: ensure columns exist in schema
  const { data, error } = await supabase
    .from('users')
    .insert({ id, email, full_name, department })
    .select('id')
    .single();
  if (error) return { error } as const;
  return { id: (data as any).id as string } as const;
}

// --- Admin helpers ---
export type UserRow = {
  id: string;
  full_name: string;
  email: string;
  department: string | null;
  role?: string | null;
  status?: string | null;
  avatar_url?: string | null;
  about?: string | null;
};

export async function listUsers(params?: { q?: string; role?: string; status?: string; page?: number; pageSize?: number; }) {
  const page = Math.max(1, params?.page ?? 1);
  const pageSize = Math.max(1, params?.pageSize ?? 20);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let q = supabase
    .from('users')
    .select('id, full_name, email, department, role, status, avatar_url, about', { count: 'exact' })
    .order('full_name', { ascending: true });
  if (params?.role) q = q.eq('role', params.role);
  if (params?.status) q = q.eq('status', params.status);
  if (params?.q && params.q.trim()) {
    const like = `%${params.q.trim()}%`;
    q = q.or(`full_name.ilike.${like},email.ilike.${like}`);
  }
  q = q.range(from, to);
  const { data, error, count } = await q;
  if (error) return { error } as const;
  return { data: (data || []) as UserRow[], count: count ?? 0 } as const;
}

export async function setUserRole(userId: string, role: 'admin' | 'hod' | 'user') {
  const { error } = await supabase.from('users').update({ role }).eq('id', userId);
  if (error) return { error } as const;
  await logAudit({ action: 'role_change', entity_type: 'user', entity_id: userId, metadata: { role } });
  const { data, error: selErr } = await supabase
    .from('users')
    .select('id, full_name, email, department, role, status, avatar_url, about')
    .eq('id', userId)
    .maybeSingle();
  if (selErr) return { ok: true } as const;
  return { ok: true, data: data as UserRow } as const;
}

export async function setUserStatus(userId: string, status: 'active' | 'disabled') {
  const { error } = await supabase.from('users').update({ status }).eq('id', userId);
  if (error) return { error } as const;
  await logAudit({ action: 'status_change', entity_type: 'user', entity_id: userId, metadata: { status } });
  const { data, error: selErr } = await supabase
    .from('users')
    .select('id, full_name, email, department, role, status, avatar_url')
    .eq('id', userId)
    .maybeSingle();
  if (selErr) return { ok: true } as const;
  return { ok: true, data: data as UserRow } as const;
}

export async function getUserById(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, department, role, status, avatar_url, about')
    .eq('id', userId)
    .maybeSingle();
  if (error) return { error } as const;
  return { data: data as UserRow } as const;
}
