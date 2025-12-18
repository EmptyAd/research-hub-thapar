import { supabase } from '@/utils/supabaseClient';
import { getSessionUser } from '@/utils/auth';

export type AuditParams = {
  action: string; // 'create' | 'update' | 'delete' | ...
  entity_type: string; // 'paper' | 'user' | ...
  entity_id: string; // id as string
  metadata?: any; // optional JSON-serializable payload
  user_id?: string; // optional override
};

export async function logAudit(params: AuditParams) {
  try {
    const uid = params.user_id || getSessionUser()?.id;
    if (!uid) return { skipped: true } as const;
    const payload = {
      action: params.action,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      user_id: uid,
      metadata: params.metadata ?? null,
    } as const;
    const { error } = await supabase.from('audit_log').insert(payload);
    if (error) return { error } as const;
    return { ok: true } as const;
  } catch (e) {
    // Never throw from audit logger; keep app flows resilient
    return { error: e } as const;
  }
}
