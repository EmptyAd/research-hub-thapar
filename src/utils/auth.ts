import { supabase } from './supabaseClient';

// Ensure bcrypt doesn't try to use Node 'crypto' in the browser.
// Provide a Web Crypto (or Math.random) fallback for random bytes.
try {
  if (!globalThis.crypto || !globalThis.crypto.getRandomValues) {
    (globalThis as any).crypto = (globalThis as any).crypto || {};
    (globalThis.crypto as any).getRandomValues = (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
      return arr;
    };
  }
} catch {}

async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const iterations = 100000;
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  const hash = new Uint8Array(bits);
  const b64 = (u8: Uint8Array) => btoa(String.fromCharCode(...Array.from(u8)));
  return `pbkdf2:${iterations}:${b64(salt)}:${b64(hash)}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith('pbkdf2:')) {
    const [, iterStr, saltB64, hashB64] = stored.split(':');
    const iterations = parseInt(iterStr, 10);
    const b2u8 = (b64: string) => new Uint8Array(atob(b64).split('').map(c => c.charCodeAt(0)));
    const enc = new TextEncoder();
    const salt = b2u8(saltB64);
    const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
    const hash = new Uint8Array(bits);
    const target = b2u8(hashB64);
    if (hash.length !== target.length) return false;
    let diff = 0;
    for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ target[i];
    return diff === 0;
  }
  return false;
}

export type AppUser = {
  id: string;
  full_name: string;
  email: string;
  department: string | null;
};

const USERS_TABLE = 'users';
const SESSION_KEY = 'thaparacad_user';
export const SESSION_CHANGE_EVENT = 'thaparacad:session-change';
const PASSWORD_RESETS_TABLE = 'password_resets';

export const DEPARTMENT_VALUES = [
  'csed', 'eced', 'med', 'ched', 'ced', 'btd', 'eied',
] as const;
export type DepartmentType = typeof DEPARTMENT_VALUES[number];

export const PASSWORD_COMPLEXITY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/?]).{8,}$/;

export async function signupUser(params: { full_name: string; email: string; password: string; department: string; }) {
  const { full_name, email, password, department } = params;
  // Password policy: min 8 chars, with uppercase, lowercase, number, and special symbol
  if (!PASSWORD_COMPLEXITY.test(password)) {
    return { error: { message: 'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special symbol.' } } as const;
  }

  // 1) Create Supabase Auth user (primary source of identity)
  let authUserId: string | undefined;
  try {
    const res = await supabase.auth.signUp({ email, password, options: { data: { full_name, department } } });
    authUserId = res.data.user?.id;
    // If email confirmations are enabled and session is null, attempt immediate sign-in
    if (!res.data.session) {
      try {
        const sres = await supabase.auth.signInWithPassword({ email, password });
        authUserId = sres.data.user?.id || authUserId;
      } catch {}
    }
  } catch (e: any) {
    return { error: { message: e?.message || 'Failed to sign up' } } as const;
  }
  if (!authUserId) return { error: { message: 'Sign up succeeded but no session. Please verify your email and login.' } } as const;

  // 2) Upsert into legacy users table keyed by auth.uid()
  const dept = (department || '').toLowerCase();
  const deptValid = (DEPARTMENT_VALUES as readonly string[]).includes(dept);
  const deptToSave: DepartmentType | null = deptValid ? (dept as DepartmentType) : null;
  const up = await supabase
    .from(USERS_TABLE)
    .upsert({ id: authUserId, full_name, email, department: deptToSave }, { onConflict: 'id' })
    .select('id, full_name, email, department')
    .maybeSingle();
  if ((up as any).error) return { error: (up as any).error } as const;
  const user: AppUser = {
    id: authUserId,
    full_name: up.data?.full_name || full_name,
    email,
    department: up.data?.department || deptToSave,
  };
  return { user };
}

export async function loginUser(email: string, password: string) {
  // 1) Sign into Supabase Auth
  let sres = await supabase.auth.signInWithPassword({ email, password });
  let sErr = (sres as any).error;
  if (sErr) {
    // User may not exist in Supabase yet; try to create then sign in
    try { await supabase.auth.signUp({ email, password }); } catch {}
    sres = await supabase.auth.signInWithPassword({ email, password });
    sErr = (sres as any).error;
    if (sErr) return { error: sErr } as const;
  }
  const authUser = sres.data.user;
  if (!authUser) return { error: { message: 'Login failed' } } as const;

  // 2) Ensure legacy users row exists and is synced (avoid duplicate key on email)
  const { data: existing } = await supabase.from(USERS_TABLE).select('id, full_name, email, department').eq('id', authUser.id).maybeSingle();
  let full_name = existing?.full_name || (authUser.user_metadata as any)?.full_name || email.split('@')[0];
  let department: any = existing?.department || null;
  if (!existing) {
    // Check if a row exists by email with a different id
    const { data: byEmail } = await supabase.from(USERS_TABLE).select('id, full_name, email, department').eq('email', email).maybeSingle();
    if (byEmail && byEmail.id !== authUser.id) {
      // Attempt to re-key the existing row to the Supabase auth uid
      // If this fails due to FKs, we'll fall back to not inserting a duplicate row
      const upd = await supabase.from(USERS_TABLE).update({ id: authUser.id }).eq('id', byEmail.id).select('id, full_name, email, department').maybeSingle();
      if (!(upd as any).error && upd.data) {
        full_name = upd.data.full_name || full_name;
        department = upd.data.department ?? department;
      } else {
        // Could not re-key; use existing fields and skip insert to avoid duplicate email violation
        full_name = byEmail.full_name || full_name;
        department = byEmail.department ?? department;
      }
    } else if (!byEmail) {
      // Safe to insert a fresh row keyed by auth uid
      const ins = await supabase
        .from(USERS_TABLE)
        .insert({ id: authUser.id, full_name, email, department })
        .select('id, full_name, email, department')
        .single();
      if ((ins as any).error) return { error: (ins as any).error } as const;
      full_name = ins.data.full_name;
      department = ins.data.department;
    }
  }
  const user: AppUser = { id: authUser.id, full_name, email, department };
  return { user };
}

export function saveSession(user: AppUser) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  try {
    window.dispatchEvent(new CustomEvent(SESSION_CHANGE_EVENT, { detail: user }));
  } catch {}
}

export function getSessionUser(): AppUser | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AppUser; } catch { return null; }
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
  try {
    window.dispatchEvent(new CustomEvent(SESSION_CHANGE_EVENT, { detail: null }));
  } catch {}
  // Also sign out Supabase session to keep state in sync
  try { supabase.auth.signOut(); } catch {}
}

// Change password by verifying current password and updating to a new one
export async function changePassword(params: { userId: string; currentPassword: string; newPassword: string; }) {
  const { userId, currentPassword, newPassword } = params;
  // Enforce same complexity as signup
  if (!PASSWORD_COMPLEXITY.test(newPassword)) {
    return { error: { message: 'New password must be at least 8 characters and include uppercase, lowercase, a number, and a special symbol.' } } as const;
  }
  // Fetch current hash
  const { data, error } = await supabase
    .from(USERS_TABLE)
    .select('password_hash')
    .eq('id', userId)
    .maybeSingle();
  if (error) return { error } as const;
  const stored = (data as any)?.password_hash as string | undefined;
  if (!stored) return { error: { message: 'Account not found or missing password.' } } as const;
  const ok = await verifyPassword(currentPassword, stored);
  if (!ok) return { error: { message: 'Current password is incorrect.' } } as const;
  const newHash = await hashPassword(newPassword);
  const upd = await supabase
    .from(USERS_TABLE)
    .update({ password_hash: newHash })
    .eq('id', userId);
  if ((upd as any).error) return { error: (upd as any).error } as const;
  return { ok: true } as const;
}

// Create a password reset token and store it. Returns {ok, resetUrl} in dev.
export async function startPasswordReset(email: string, opts?: { baseUrl?: string }) {
  const { data: u, error } = await supabase
    .from(USERS_TABLE)
    .select('id, email, full_name')
    .eq('email', email)
    .maybeSingle();
  if (error) return { error } as const;
  if (!u) return { ok: true } as const; // avoid leaking which emails exist

  // Generate a temporary password and set it immediately
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*';
  const tempPassword = Array.from(bytes).map(b => alphabet[b % alphabet.length]).join('');
  const newHash = await hashPassword(tempPassword);
  const upd = await supabase.from(USERS_TABLE).update({ password_hash: newHash }).eq('id', u.id);
  if ((upd as any).error) return { error: (upd as any).error } as const;

  // Optional: record reset event
  try {
    const expires_at = new Date(Date.now() + 1000 * 60 * 30).toISOString();
    await supabase.from(PASSWORD_RESETS_TABLE).insert({ user_id: u.id, token: `immediate:${Date.now()}`, expires_at, used: true });
  } catch {}

  // Send email via webhook if configured
  const EMAIL_WEBHOOK_URL = (import.meta as any).env?.VITE_EMAIL_WEBHOOK_URL as string | undefined;
  if (EMAIL_WEBHOOK_URL) {
    try {
      await fetch(EMAIL_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: u.email,
          subject: 'Your new password',
          text: `${tempPassword}`,
        }),
      });
    } catch {}
  }

  // In dev, return the password so it can be copied if email isn't wired
  return { ok: true, password: EMAIL_WEBHOOK_URL ? undefined : tempPassword } as const;
}

// Complete password reset given a valid token
export async function completePasswordReset(token: string, newPassword: string) {
  if (!PASSWORD_COMPLEXITY.test(newPassword)) {
    return { error: { message: 'New password must be at least 8 characters and include uppercase, lowercase, a number, and a special symbol.' } } as const;
  }
  const now = new Date().toISOString();
  const { data: row, error } = await supabase
    .from(PASSWORD_RESETS_TABLE)
    .select('id, user_id, expires_at, used')
    .eq('token', token)
    .maybeSingle();
  if (error) return { error } as const;
  if (!row) return { error: { message: 'Invalid or expired link.' } } as const;
  if ((row as any).used) return { error: { message: 'This link has already been used.' } } as const;
  if ((row as any).expires_at && (row as any).expires_at < now) return { error: { message: 'This link has expired.' } } as const;

  const newHash = await hashPassword(newPassword);
  const upd1 = await supabase.from(USERS_TABLE).update({ password_hash: newHash }).eq('id', (row as any).user_id);
  if ((upd1 as any).error) return { error: (upd1 as any).error } as const;
  const upd2 = await supabase.from(PASSWORD_RESETS_TABLE).update({ used: true }).eq('id', (row as any).id);
  if ((upd2 as any).error) return { error: (upd2 as any).error } as const;
  return { ok: true } as const;
}
