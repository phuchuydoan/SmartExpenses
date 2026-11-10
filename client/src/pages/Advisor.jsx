import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, RefreshCw, Lightbulb, Eye, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/hooks.jsx';
import { cx, money, timeAgo } from '../lib/format.js';
import { Badge, Button, Card, CardTitle } from '../components/ui.jsx';

const STARTERS = ['Am I spending too much this month?', 'How can I save $100 this month?', 'Can I afford a $100 purchase?', 'How much should I save every week?', 'Why did I spend more this month?'];
const PRIORITY = { high: ['bad', 'Needs attention'], medium: ['warn', 'Keep an eye on it'], low: ['good', 'On track'] };

function Orb({ className }) {
  return (
    <span className={cx('relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-brand-400 to-teal-600 text-white', className)}>
      <Sparkles className="size-1/2" />
      <img src="/images/orb.jpg" alt="" className="absolute inset-0 size-full object-cover" onError={(e) => e.currentTarget.remove()} />
    </span>
  );
}

function Insight() {
  const { data, reload } = useApi('/ai/insights');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const insight = data?.insights?.[0];

  async function analyse() {
    setLoading(true);
    setError('');
    try {
      await api('/ai/insights', { method: 'POST', body: {} });
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardTitle
        hint={insight ? `${insight.source === 'gemini' ? 'Analysed by Gemini' : 'Built-in analysis'} · ${timeAgo(insight.createdAt)}` : 'A personal analysis of your spending this month.'}
        action={<Button size="sm" variant="secondary" icon={RefreshCw} loading={loading} onClick={analyse}>{insight ? 'Refresh' : 'Analyse'}</Button>}
      >
        Spending analysis
      </CardTitle>
      {error && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!insight ? (
        <p className="text-sm text-ink-3">{loading ? 'Looking at your numbers...' : 'Press Analyse to get observations and saving ideas based on your real transactions.'}</p>
      ) : (
        <div className={cx('space-y-5', loading && 'opacity-50')}>
          <div>
            <Badge tone={PRIORITY[insight.priority][0]}>{PRIORITY[insight.priority][1]}</Badge>
            <p className="mt-2 font-medium">{insight.summary}</p>
          </div>
          {insight.observations.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3"><Eye className="size-3.5" /> What we noticed</p>
              <ul className="space-y-2 text-sm text-ink-2">
                {insight.observations.map((o, i) => <li key={i} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-3/50" />{o}</li>)}
              </ul>
            </div>
          )}
          {insight.recommendations.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3"><Lightbulb className="size-3.5" /> Recommendations</p>
              <ul className="space-y-2">
                {insight.recommendations.map((r, i) => (
                  <li key={i} className="rounded-xl border border-line p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold">{r.category}</span>
                      {r.potential_savings > 0 && <Badge tone="good">Save ~{money(r.potential_savings)}</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-ink-2">{r.action}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Chat() {
  const [messages, setMessages] = useState([]);
  const [followUps, setFollowUps] = useState(STARTERS);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scroller = useRef(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  async function send(text) {
    const message = text.trim();
    if (!message || sending) return;
    const history = messages.filter((m) => !m.error).map(({ role, text: t }) => ({ role, text: t }));
    setMessages((list) => [...list, { role: 'user', text: message }]);
    setInput('');
    setSending(true);
    try {
      const data = await api('/ai/chat', { method: 'POST', body: { message, history } });
      setMessages((list) => [...list, { role: 'model', text: data.reply, error: data.source !== 'gemini' }]);
      setFollowUps(data.followUps?.length ? data.followUps : STARTERS.slice(0, 3));
    } catch (err) {
      setMessages((list) => [...list, { role: 'model', text: err.message, error: true }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="flex h-[min(42rem,calc(100dvh-15rem))] lg:h-[min(42rem,calc(100dvh-12rem))] flex-col !p-0">
      <header className="flex items-center gap-3 border-b border-line px-5 py-4">
        <Orb className="size-10" />
        <div>
          <h2 className="font-semibold">Chat with your money</h2>
          <p className="text-xs text-ink-3">Answers use your real, up-to-date numbers</p>
        </div>
      </header>

      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Orb className="size-16" />
            <p className="mt-4 font-display text-lg font-semibold">Ask me anything about your money</p>
            <p className="mt-1 max-w-sm text-sm text-ink-3">I can see your budget, spending, bills and goals - and suggest what to do next.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cx('flex gap-2.5', m.role === 'user' && 'justify-end')}>
            {m.role === 'model' && <Orb className="mt-0.5 size-7" />}
            <p className={cx('max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed', m.role === 'user' ? 'rounded-br-md bg-ink text-white' : m.error ? 'rounded-bl-md bg-amber-50 text-amber-900' : 'rounded-bl-md bg-canvas text-ink')}>
              {m.text}
            </p>
          </div>
        ))}
        {sending && (
          <div className="flex gap-2.5" aria-label="The advisor is typing">
            <Orb className="mt-0.5 size-7" />
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-canvas px-4 py-3.5">
              {[0, 150, 300].map((d) => <span key={d} className="size-1.5 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: `${d}ms` }} />)}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-line p-4">
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {followUps.map((q) => (
            <button key={q} onClick={() => send(q)} disabled={sending} className="shrink-0 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:border-brand-500 hover:text-brand-700 disabled:opacity-50">
              {q}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} placeholder="Ask about your spending, budget or goals..." aria-label="Message" className="h-11 flex-1 rounded-xl border border-line px-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15" />
          <Button type="submit" variant="brand" className="!h-11 !px-4" disabled={!input.trim() || sending} aria-label="Send"><Send className="size-4" /></Button>
        </form>
      </div>
    </Card>
  );
}

export default function Advisor() {
  const { data: status } = useApi('/ai/status');
  return (
    <div className="animate-rise">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight">AI Advisor <Badge tone="good"><Sparkles className="size-3" /> Gemini</Badge></h1>
          <p className="mt-0.5 text-sm text-ink-3">Advice based on your own numbers.</p>
        </div>
      </div>
      {status && !status.enabled && (
        <p className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Gemini is not configured on this server (GEMINI_API_KEY is missing). The analysis falls back to built-in rules and chat is unavailable.</p>
      )}
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3"><Chat /></div>
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Insight />
          <p className="flex gap-2 rounded-2xl bg-white p-4 text-xs text-ink-3 ring-1 ring-line">
            <ShieldCheck className="size-4 shrink-0 text-brand-600" />
            All balances and totals are calculated by SmartSpend, not by the AI. Only summarised spending data is shared with Gemini - never your name, email or password. This is budgeting guidance, not professional financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}
