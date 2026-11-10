import { useEffect, useRef, useState } from 'react';
import { Bell, TriangleAlert, CalendarClock, TrendingUp, ChartColumn, Trophy, Lightbulb, CheckCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { cx, timeAgo } from '../lib/format.js';
import { Empty } from './ui.jsx';

const META = {
  budget_threshold: { icon: Bell, tone: 'bg-amber-50 text-amber-600', label: 'Budget alert' },
  budget_exceeded: { icon: TriangleAlert, tone: 'bg-red-50 text-red-600', label: 'Over budget' },
  bill_reminder: { icon: CalendarClock, tone: 'bg-sky-50 text-sky-600', label: 'Bill reminder' },
  unusual_spending: { icon: TrendingUp, tone: 'bg-violet-50 text-violet-600', label: 'Unusual spending' },
  weekly_report: { icon: ChartColumn, tone: 'bg-brand-50 text-brand-600', label: 'Weekly report' },
  goal_reached: { icon: Trophy, tone: 'bg-brand-50 text-brand-600', label: 'Goal reached' },
};

export function NotificationItem({ n, onRead }) {
  const meta = META[n.type] ?? META.budget_threshold;
  const Icon = meta.icon;
  return (
    <li className={cx('flex gap-3 px-4 py-3.5', !n.read && 'bg-brand-50/40')}>
      <span className={cx('grid size-9 shrink-0 place-items-center rounded-xl', meta.tone)}><Icon className="size-[18px]" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 text-xs text-ink-3">
          <span className="font-medium">{meta.label}</span>
          <span className="shrink-0">{timeAgo(n.createdAt)}</span>
        </div>
        <p className="mt-0.5 text-sm font-semibold">{n.title}</p>
        <p className="mt-0.5 text-sm text-ink-2">{n.message}</p>
        {n.tip && (
          <p className="mt-2 flex gap-1.5 rounded-lg bg-canvas px-2.5 py-1.5 text-xs text-ink-2">
            <Lightbulb className="mt-px size-3.5 shrink-0 text-amber-500" />
            <span><span className="font-medium">Tip:</span> {n.tip}</span>
          </p>
        )}
        {!n.read && onRead && (
          <button onClick={() => onRead(n.id)} className="mt-1.5 text-xs font-medium text-brand-700 hover:underline">Mark as read</button>
        )}
      </div>
    </li>
  );
}

/** Bell with unread badge and a dropdown panel. Polls every minute. */
export function NotificationBell({ dark }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ unread: 0, notifications: [] });
  const ref = useRef(null);

  const load = () => api('/notifications', { query: { limit: 20 } }).then(setData).catch(() => {});
  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    const refresh = () => load();
    window.addEventListener('smartspend:changed', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('smartspend:changed', refresh);
    };
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const readOne = async (id) => {
    await api(`/notifications/${id}/read`, { method: 'POST' });
    load();
  };
  const readAll = async () => {
    await api('/notifications/read-all', { method: 'POST' });
    load();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`}
        className={cx('relative grid size-10 place-items-center rounded-xl transition-colors', dark ? 'text-white/80 hover:bg-white/10' : 'border border-line bg-white text-ink-2 hover:bg-canvas')}
      >
        <Bell className="size-[18px]" />
        {data.unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {data.unread > 9 ? '9+' : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-16 z-40 animate-rise overflow-hidden rounded-2xl border border-line bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[24rem]">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-semibold">Notifications</h2>
            {data.unread > 0 && (
              <button onClick={readAll} className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                <CheckCheck className="size-3.5" /> Mark all as read
              </button>
            )}
          </header>
          {data.notifications.length === 0 ? (
            <Empty icon={Bell} title="You're all caught up">Budget alerts, bill reminders and weekly reports will show up here.</Empty>
          ) : (
            <ul className="max-h-[60dvh] divide-y divide-line overflow-y-auto">
              {data.notifications.map((n) => <NotificationItem key={n.id} n={n} onRead={readOne} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Tell the bell (and anything else listening) that money data changed. */
export const notifyChanged = () => window.dispatchEvent(new Event('smartspend:changed'));
