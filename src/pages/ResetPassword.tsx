import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/utils/supabaseClient";
import { PASSWORD_COMPLEXITY } from "@/utils/auth";

async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = new Uint8Array(16);
  (globalThis.crypto || window.crypto).getRandomValues(salt);
  const key = await (globalThis.crypto || window.crypto).subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const iterations = 100000;
  const bits = await (globalThis.crypto || window.crypto).subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256
  );
  const hash = new Uint8Array(bits);
  const b64 = (u8: Uint8Array) => btoa(String.fromCharCode(...Array.from(u8)));
  return `pbkdf2:${iterations}:${b64(salt)}:${b64(hash)}`;
}

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Reset Password | ThaparAcad";
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!PASSWORD_COMPLEXITY.test(password)) {
      setError("Password must be at least 8 characters and include uppercase, lowercase, a number, and a special symbol.");
      return;
    }
    setIsLoading(true);
    // Supabase sets a reset session when user opens the email link
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setIsLoading(false);
      setError("Reset link is invalid or expired. Please request a new one.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    setIsLoading(false);
    if (error) {
      setError(error.message);
    } else {
      // Also sync password to custom users table for legacy login path
      try {
        const { data: u } = await supabase.auth.getUser();
        const email = u.user?.email;
        if (email) {
          const password_hash = await hashPassword(password);
          await supabase.from('users').update({ password_hash }).eq('email', email);
        }
      } catch {}
      setSuccess(true);
      // Optionally redirect after a short delay
      setTimeout(() => navigate("/login", { replace: true }), 1500);
    }
  };

  return (
    <main className="container mx-auto py-10 max-w-md">
      <h1 className="text-3xl font-bold mb-6">Set a new password</h1>
      {!success ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" variant="hero" className="w-full" disabled={isLoading}>
            {isLoading ? "Updating..." : "Update password"}
          </Button>
          <p className="text-sm text-muted-foreground">If the link is invalid, request a new one from the <Link to="/forgot-password" className="text-primary">Forgot Password</Link> page.</p>
        </form>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">Your password has been updated. Redirecting to login…</p>
          <p className="text-sm">Go to <Link to="/login" className="text-primary">Login</Link></p>
        </div>
      )}
    </main>
  );
};

export default ResetPassword;
