import { useEffect, useState } from 'react';
import { submitEnquiry } from '../api.js';
import '../styles/contact.css';

const WA_NUMBER = '919900599872';

export default function ContactSection({ categories, presetCostume }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', costume: '', message: '' });
  const [status, setStatus] = useState('idle'); // idle | sending | error

  useEffect(() => {
    if (presetCostume) setForm((f) => ({ ...f, costume: presetCostume }));
  }, [presetCostume]);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      alert('Please fill in your name and phone number.');
      return;
    }
    if (!form.costume) {
      alert('Please select a costume type.');
      return;
    }

    setStatus('sending');
    try {
      await submitEnquiry({
        name: form.name,
        phone: form.phone,
        email: form.email,
        costume_type: form.costume,
        message: form.message
      });
    } catch (err) {
      // We still let the customer reach WhatsApp even if the save failed —
      // that channel is the fallback of record.
      console.error('Could not save enquiry:', err.message);
    } finally {
      setStatus('idle');
    }

    const text =
      `Namaste! New order enquiry — Natya Vastra\n\n` +
      `Name: ${form.name}\nPhone: ${form.phone}\nEmail: ${form.email || 'Not provided'}\n` +
      `Costume Type: ${form.costume}\nMessage:\n${form.message || 'Not provided'}`;
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <section className="contact" id="contact">
      <div className="container contact__grid">
        <div className="contact__info">
          <div className="section-heading on-ink">
            <h2>Start your order</h2>
            <p>Tell us the occasion and we'll get back to you within a day.</p>
          </div>

          <dl className="contact__details">
            <div>
              <dt>Workshop</dt>
              <dd>2nd Floor, No. 2397/29A, 18th Main Road, Above Baskin Robbins,
                2nd Stage, Kumaraswamy Layout, Bengaluru, Karnataka – 560078</dd>
            </div>
            <div>
              <dt>Phone / WhatsApp</dt>
              <dd>+91 99005 99872</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>chigurucostumes@gmail.com</dd>
            </div>
            <div>
              <dt>Hours</dt>
              <dd>Mon – Sat, 10am – 7pm</dd>
            </div>
          </dl>

          <p className="contact__note">
            All costumes are custom-stitched to your measurements. Delivery takes
            3–4 weeks. Bulk orders for dance schools welcome.
          </p>
        </div>

        <form className="contact__form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="field-name">Your name</label>
            <input id="field-name" value={form.name} onChange={update('name')} placeholder="Full name" />
          </div>
          <div className="form-group">
            <label htmlFor="field-phone">Phone / WhatsApp</label>
            <input id="field-phone" value={form.phone} onChange={update('phone')} placeholder="+91 XXXXX XXXXX" />
          </div>
          <div className="form-group">
            <label htmlFor="field-email">Email address</label>
            <input id="field-email" type="email" value={form.email} onChange={update('email')} placeholder="your@email.com" />
          </div>
          <div className="form-group">
            <label htmlFor="field-costume">Costume type</label>
            <select id="field-costume" value={form.costume} onChange={update('costume')}>
              <option value="">Select a costume type</option>
              {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              <option>Custom / Other</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="field-message">Message / measurements</label>
            <textarea
              id="field-message"
              value={form.message}
              onChange={update('message')}
              placeholder="Describe your requirements, measurements, colour preference, etc."
              rows={4}
            />
          </div>
          <button type="submit" className="btn btn-gold contact__submit" disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending…' : 'Send order via WhatsApp'}
          </button>
        </form>
      </div>
    </section>
  );
}
