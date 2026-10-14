import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { askAssistant } from '../api.js';
import CostumeCard from '../components/CostumeCard.jsx';

const WA_NUMBER = '919900599872';
const STARTERS = [
  'I need a costume for my first stage performance',
  'Something for a grade exam, size 30',
  'What do you have for a group of six girls?'
];

// The server wants the conversation to start with a customer message, so trim old turns safely.
function recentHistory(messages) {
  const history = messages.map(({ role, content }) => ({ role, content })).slice(-12);
  while (history.length && history[0].role !== 'user') history.shift();
  return history;
}

export default function AssistantPage() {
  const [messages, setMessages] = useState([]); // { role, content, costumes?, payableBooking? }
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);

  const send = async (text) => {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setError('');
    setBusy(true);
    try {
      const r = await askAssistant(recentHistory(next));
      setMessages([...next, { role: 'assistant', content: r.reply, costumes: r.costumes, payableBooking: r.payableBooking }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e) => { e.preventDefault(); send(input); };

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: '780px' }}>
        <div className="section-heading" style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <h1 className="page-title">Costume assistant</h1>
          <p style={{ maxWidth: '60ch', margin: '0 auto' }}>
            Tell us about the occasion and the dancer's size, and our assistant will suggest costumes from our collection.
          </p>
        </div>

        <div className="chat-window">
          <div className="chat-window__header">
            <div className="chat-window__header-info">
              <span className="chat-window__avatar">🎭</span>
              <div>
                <strong>Natya Vastra Concierge</strong>
                <span className="chat-window__status">● AI Ready</span>
              </div>
            </div>
            <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noreferrer" className="chat-window__wa-btn">
              WhatsApp Us
            </a>
          </div>

          <div className="chat-window__body" aria-live="polite">
            {messages.length === 0 && (
              <div className="chat__starters">
                <p style={{ fontWeight: 600, color: 'var(--maroon)', margin: '0 0 0.5rem' }}>
                  Frequently asked questions:
                </p>
                {STARTERS.map((s) => (
                  <button key={s} type="button" className="chip-btn" onClick={() => send(s)}>
                    💬 {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`chat__row chat__row--${m.role}`}>
                <div className="chat__bubble">{m.content}</div>
                {m.payableBooking && (
                  <div className="chat-payable-card animate-fade-in">
                    <div>
                      <span className="badge badge--ok" style={{ marginBottom: '0.2rem', display: 'inline-block' }}>✓ Confirmed by Store</span>
                      <div style={{ fontWeight: 700, color: 'var(--maroon)', fontSize: '0.96rem' }}>
                        Booking #{m.payableBooking.id} is ready: 50% Deposit ₹{m.payableBooking.depositAmount}
                      </div>
                      <small style={{ color: 'var(--text-muted)' }}>
                        {m.payableBooking.title} · {m.payableBooking.dates}
                      </small>
                    </div>
                    <Link to="/account" className="btn btn-primary btn-sm">
                      View Booking / Pay Now →
                    </Link>
                  </div>
                )}
                {m.costumes?.length > 0 && (
                  <div className="costume-grid chat__costumes">
                    {m.costumes.map((c) => <CostumeCard key={c.id} costume={c} />)}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="chat__row chat__row--assistant">
                <div className="chat__bubble chat__bubble--typing">
                  <span className="typing-dots">Searching collection & thinking…</span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {error && (
            <div className="chat-window__error" role="alert">
              <span>⚠️ {error}</span>
              <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noreferrer" className="link-btn" style={{ marginLeft: '0.5rem', whiteSpace: 'nowrap' }}>
                Message us on WhatsApp →
              </a>
            </div>
          )}

          <form className="chat-window__footer" onSubmit={onSubmit}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={1000}
              placeholder="Ask about costume styles, sizes, or occasions…"
              aria-label="Your question"
              disabled={busy}
            />
            <button className="btn btn-primary" type="submit" disabled={busy || !input.trim()}>
              {busy ? 'Sending…' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
