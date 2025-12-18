import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { signupUser, DEPARTMENT_VALUES } from '@/utils/auth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, EyeOff } from 'lucide-react';

const Signup = () => {
  const [full_name, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const emailOk = /^[A-Za-z0-9._%+-]+@thapar\.edu$/.test(email.trim());
    if (!emailOk) {
      setLoading(false);
      setError('Please use your official @thapar.edu email address.');
      return;
    }
    const { error } = await signupUser({ full_name, email, password, department });
    setLoading(false);
    if (error) {
      setError((error as any).message ?? 'Signup failed');
      return;
    }
    navigate('/login');
  };

  return (
    <main className="container mx-auto py-10 max-w-md">
      <h1 className="text-3xl font-bold mb-6">Create account</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" value={full_name} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required pattern={"^[A-Za-z0-9._%+-]+@thapar\\.edu$"} title="Use your @thapar.edu email" />
          <p className="mt-1 text-xs text-muted-foreground">Only official emails allowed: example@thapar.edu</p>
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              pattern={"(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*()_+\-=[\\]{};':\"\\|,.<>/?]).{8,}"}
              title="At least 8 characters with uppercase, lowercase, number, and a special symbol"
              className="pr-10"
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">At least 8 characters including uppercase, lowercase, a number, and a special symbol.</p>
        </div>
        <div>
          <Label htmlFor="department">Department</Label>
          <Select value={department} onValueChange={(v) => setDepartment(v)}>
            <SelectTrigger id="department">
              <SelectValue placeholder="Select department" />
            </SelectTrigger>
            <SelectContent>
              {DEPARTMENT_VALUES.map((d) => (
                <SelectItem key={d} value={d}>{d.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating account...' : 'Sign up'}
        </Button>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">
        Already have an account? <Link className="text-primary" to="/login">Login</Link>
      </p>
    </main>
  );
};

export default Signup;
