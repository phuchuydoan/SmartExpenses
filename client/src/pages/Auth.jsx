import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, CalendarDays, BellRing } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { Button, Field, Input } from '../components/ui.jsx';
import { Logo } from '../components/Layout.jsx';

const POINTS = [
  { icon: CalendarDays, title: 'Know what you can spend today', text: 'A daily limit that adapts to your budget, your bills and the days left.' },
  { icon: Sparkles, title: 'Advice from Gemini AI', text: 'Ask anything about your money and get answers based on your real numbers.' },
  { icon: BellRing, title: 'Alerts before you overspend', text: 'Get warned at 50%, 80% and 100% of every budget.' },
];

export default function Auth({ mode }) {
  const isRegister = mode === 'register';
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function run(path, body) {
    setLoading(true);
    setError('');
    try {
      await signIn(path, body);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const submit = (e) => {
    e.preventDefault();
    if (isRegister) {
      run('/auth/register', { ...form, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
    } else {
      run('/auth/login', { email: form.email, password: form.password });
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <div className="hero-surface relative hidden overflow-hidden lg:block">
        <img src="/images/hero.jpg" alt="" className="absolute inset-0 size-full object-cover opacity-90" onError={(e) => e.currentTarget.remove()} />
        <div className="absolute inset-0 bg-gradient-to-t from-night via-night/40 to-transparent" />
        <div className="relative flex h-full flex-col justify-between p-10 text-white">
          <Logo light />
          <div>
            <h1 className="max-w-md font-display text-4xl font-semibold leading-tight tracking-tight">Track smarter. Spend better. Save more.</h1>
            <ul className="mt-8 max-w-md space-y-5">
              {POINTS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-brand-400 backdrop-blur"><Icon className="size-5" /></span>
                  <div>
                    <p className="font-medium">{title}</p>
                    <p className="text-sm text-white/65">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-10 lg:hidden"><Logo /></div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">{isRegister ? 'Create your account' : 'Welcome back'}</h2>
          <p className="mt-1 text-sm text-ink-3">{isRegister ? 'Start planning your money in under a minute.' : 'Sign in to see where your money is going.'}</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            {isRegister && (
              <Field label="Name"><Input value={form.name} onChange={set('name')} autoComplete="name" required maxLength={100} /></Field>
            )}
            <Field label="Email"><Input type="email" value={form.email} onChange={set('email')} autoComplete="email" required /></Field>
            <Field label="Password" hint={isRegister ? 'At least 8 characters' : undefined}>
              <Input type="password" value={form.password} onChange={set('password')} autoComplete={isRegister ? 'new-password' : 'current-password'} required minLength={isRegister ? 8 : 1} maxLength={72} />
            </Field>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
            <Button type="submit" variant="brand" className="w-full" loading={loading}>{isRegister ? 'Create account' : 'Sign in'}</Button>
          </form>

          {!isRegister && (
            <Button variant="secondary" className="mt-3 w-full" disabled={loading} onClick={() => run('/auth/login', { email: 'demo@smartspend.app', password: 'demo12345' })}>
              Try the demo account
            </Button>
          )}
          <p className="mt-6 text-center text-sm text-ink-3">
            {isRegister ? 'Already have an account? ' : 'New to SmartSpend? '}
            <Link to={isRegister ? '/login' : '/register'} className="font-medium text-brand-700 hover:underline">{isRegister ? 'Sign in' : 'Create an account'}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
