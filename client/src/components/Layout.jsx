import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { House, ArrowLeftRight, ChartPie, CalendarDays, ChartColumn, Sparkles, Target, Settings, Plus, LogOut } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { cx } from '../lib/format.js';
import { NotificationBell, notifyChanged } from './Notifications.jsx';
import { TransactionForm } from './TransactionForm.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: House, end: true, mobile: true },
  { to: '/transactions', label: 'Transactions', short: 'Expenses', icon: ArrowLeftRight, mobile: true },
  { to: '/budget', label: 'Budget Planner', icon: ChartPie },
  { to: '/planner', label: 'Daily Planner', short: 'Today', icon: CalendarDays, mobile: true },
  { to: '/analytics', label: 'Analytics', short: 'Reports', icon: ChartColumn },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/advisor', label: 'AI Advisor', short: 'AI', icon: Sparkles, mobile: true },
  { to: '/settings', label: 'Settings', short: 'More', icon: Settings, mobile: true },
];

export function Logo({ light }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/favicon.svg" alt="" className="size-8" />
      <span className={cx('font-display text-lg font-semibold tracking-tight', light ? 'text-white' : 'text-ink')}>
        SmartSpend <span className="text-brand-400">AI</span>
      </span>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [adding, setAdding] = useState(false);
  const [version, setVersion] = useState(0);
  const location = useLocation();

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="hero-surface fixed inset-y-0 left-0 hidden w-64 flex-col p-4 lg:flex">
        <div className="px-2 py-3"><Logo light /></div>
        <nav className="mt-4 flex-1 space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors', isActive ? 'bg-white/12 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white')
              }
            >
              <Icon className="size-[18px]" />
              {label}
              {to === '/advisor' && <span className="ml-auto rounded-full bg-brand-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-brand-400">Gemini</span>}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-semibold text-white">{user.name.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="truncate text-xs text-white/50">{user.email}</p>
          </div>
          <button onClick={logout} aria-label="Sign out" title="Sign out" className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line/70 bg-canvas/85 px-4 py-3 backdrop-blur lg:px-8">
        <div className="lg:hidden"><Logo /></div>
        <p className="hidden text-sm text-ink-3 lg:block">Track smarter. Spend better. Save more.</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setAdding(true)} className="hidden h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700 sm:inline-flex">
            <Plus className="size-4" /> Add transaction
          </button>
          <NotificationBell />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 lg:px-8 lg:pb-10" key={`${location.pathname}:${version}`}>
        <Outlet />
      </main>

      {/* Mobile: floating add button + bottom tabs */}
      <button onClick={() => setAdding(true)} aria-label="Add transaction" className={cx('fixed bottom-20 right-4 z-30 size-14 place-items-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 sm:hidden', location.pathname === '/advisor' ? 'hidden' : 'grid')}>
        <Plus className="size-6" />
      </button>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {NAV.filter((n) => n.mobile).map(({ to, short, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium', isActive ? 'text-brand-700' : 'text-ink-3')}>
            <Icon className="size-5" />
            {short}
          </NavLink>
        ))}
      </nav>

      <TransactionForm
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          notifyChanged();
          setVersion((v) => v + 1); // reload the current page's data
        }}
      />
    </div>
  );
}
