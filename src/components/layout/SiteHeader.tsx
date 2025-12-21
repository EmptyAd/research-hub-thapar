import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { Search, Settings } from "lucide-react";
//
import { NotificationBell } from '@/components/NotificationBell';
import { getSessionUser, SESSION_CHANGE_EVENT, logout as legacyLogout } from "@/utils/auth";
import { getUserRole } from "@/utils/users";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
// helper to get initials from a name/email
const initialsOf = (s?: string | null) => {
  if (!s) return "ME";
  const name = s.split('@')[0];
  const parts = name.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0,2).toUpperCase();
};

const SiteHeader = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [legacyUser, setLegacyUser] = useState(() => getSessionUser());
  const [role, setRole] = useState<string | undefined>(undefined);

  useEffect(() => {
    const onSession = () => setLegacyUser(getSessionUser());
    window.addEventListener(SESSION_CHANGE_EVENT, onSession as any);
    window.addEventListener('storage', onSession);
    return () => {
      window.removeEventListener(SESSION_CHANGE_EVENT, onSession as any);
      window.removeEventListener('storage', onSession);
    };
  }, []);

  // Load role for conditional admin-only menu
  useEffect(() => {
    let active = true;
    async function load() {
      const id = (user as any)?.id || (legacyUser as any)?.id;
      if (!id) { if (active) setRole(undefined); return; }
      try { const { role } = await getUserRole(id); if (active) setRole(role); } catch {}
    }
    load();
    return () => { active = false; };
  }, [user, legacyUser]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    navigate(params.toString() ? `/?${params.toString()}` : "/");
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b-2 border-accent bg-primary text-primary-foreground">
      <div className="container mx-auto h-20 sm:h-24 flex items-center gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="Thapar Institute" className="h-12 sm:h-14 w-auto" />
            <span className="hidden sm:inline text-xl sm:text-2xl font-bold tracking-tight">ThaparAcad</span>
          </Link>
        </div>
        <div className="flex-1 min-w-[160px]">
          <form onSubmit={onSearch} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-foreground/80" />
            <Input
              value={q}
              onChange={(e)=>setQ(e.target.value)}
              placeholder="Search research papers, people, documents"
              className="pl-9 pr-3 h-10 rounded-full bg-white text-foreground placeholder:text-foreground/60 focus-visible:ring-2"
            />
          </form>
        </div>
        <div className="flex items-center gap-2">
          {user || legacyUser ? (
            <>
              <Button
                className="rounded-full"
                onClick={() => {
                  const isPriv = role === 'admin' || role === 'hod';
                  navigate(isPriv ? '/report' : '/report?scope=me');
                }}
              >
                Insights
              </Button>
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button aria-label="Settings" className="inline-flex items-center justify-center h-10 w-10 rounded-full hover:bg-white/10">
                    <Settings className="h-5 w-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {role === 'admin' && (
                    <>
                      <DropdownMenuItem onClick={()=> navigate('/audit-log')}>Audit Log</DropdownMenuItem>
                      <DropdownMenuItem onClick={()=> navigate('/admin/users')}>Manage Users</DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem onClick={()=> navigate('/dashboard?settings=profile')}>Profile setting</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={()=> { legacyLogout(); navigate('/login'); }}>Logout</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Link to="/dashboard" aria-label="Profile" className="h-10 w-10 rounded-full bg-white text-foreground text-sm font-semibold flex items-center justify-center">
                {initialsOf((user as any)?.email || legacyUser?.email || legacyUser?.full_name)}
              </Link>
            </>
          ) : (
            <>
              <Button asChild variant="outline" className="rounded-full bg-white text-foreground">
                <Link to="/login">Login</Link>
              </Button>
              <Button asChild className="rounded-full">
                <Link to="/signup">Sign Up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default SiteHeader;
