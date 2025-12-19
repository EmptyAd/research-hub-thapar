// Supabase Edge Function: reset-temp-password
// Generates a temporary password for a user by email, updates it via Admin API,
// and emails the temp password using Resend. Requires env vars:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - RESEND_API_KEY
// - RESEND_FROM (e.g., no-reply@yourdomain.com)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

interface ReqBody { email?: string }

function generateTempPassword(len = 16) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+[]{};:,.?";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes).map(b => alphabet[b % alphabet.length]).join("");
}

async function sendEmailResend(to: string, tempPassword: string) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const RESEND_FROM = Deno.env.get("RESEND_FROM") || "no-reply@example.com";
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY missing");
  const subject = "Your temporary password";
  const html = `
    <h2>Temporary Password</h2>
    <p>Use this temporary password to log in:</p>
    <p style="font-size:18px;font-weight:700;">${tempPassword}</p>
    <p>Please change your password after logging in.</p>
  `;
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [to],
      subject,
      html,
    }),
  });
  if (!resp.ok) throw new Error(`Resend failed: ${await resp.text()}`);
}

serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ error: "invalid_content_type" }), { status: 415 });
    }
    const { email } = (await req.json()) as ReqBody;
    if (!email) return new Response(JSON.stringify({ error: "email_required" }), { status: 400 });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "missing_service_config" }), { status: 500 });
    }
    const admin = createClient(supabaseUrl, serviceKey);

    // 1) Get auth user by email
    const { data: got, error: getErr } = await admin.auth.admin.getUserByEmail(email);
    if (getErr || !got?.user) {
      // Do not leak user existence; respond OK
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // 2) Generate temp password and set it
    const temp = generateTempPassword(16);
    const { error: updErr } = await admin.auth.admin.updateUserById(got.user.id, {
      password: temp,
      user_metadata: { force_password_change: true },
    });
    if (updErr) throw updErr;

    // 3) Email the temp password
    await sendEmailResend(email, temp);

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error("reset-temp-password error", e);
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500 });
  }
});
