import { useEffect, useRef, useState } from 'react';
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
  const [messages, setMessages] = useState([]); // { role, content, costumes? }
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
      setMessages([...next, { role: 'assistant', content: r.reply, costumes: r.costumes }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e) => { e.preventDefault(); send(input); };

  return (
    <main className="page">
      <div className="container chat">
        <div className="section-heading">
          <h1 className="page-title">Costume assistant</h1>
          <p>Tell us about the occasion and the dancer's size, and we will suggest costumes from our collection. For prices and dates, the costume page and WhatsApp are always the final word.</p>
        </div>

        <div className="chat__log" aria-live="polite">
          {messages.length === 0 && (
            <div className="chat__starters">
              <p>Try asking:</p>
              {STARTERS.map((s) => <button key={s} type="button" className="chip-btn" onClick={() => send(s)}>{s}</button>)}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat__row chat__row--${m.role}`}>
              <div className="chat__bubble">{m.content}</div>
              {m.costumes?.length > 0 && (
                <div className="costume-grid chat__costumes">
                  {m.costumes.map((c) => <CostumeCard key={c.id} costume={c} />)}
                </div>
              )}
            </div>
          ))}
          {busy && <div className="chat__row chat__row--assistant"><div className="chat__bubble chat__bubble--typing">Thinking…</div></div>}
          <div ref={endRef} />
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}{' '}
            <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noreferrer">Message us on WhatsApp</a>
          </p>
        )}

        <form className="chat__form" onSubmit={onSubmit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={1000}
            placeholder="Type your question…"
            aria-label="Your question"
          />
          <button className="btn btn-primary" disabled={busy || !input.trim()}>Send</button>
        </form>
      </div>
    </main>
  );
}
