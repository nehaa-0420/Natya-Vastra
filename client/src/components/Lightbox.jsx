import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../styles/lightbox.css';

export default function Lightbox({ images, details, index, onClose, onNav }) {
  const open = index !== null && index !== undefined;

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNav(-1);
      if (e.key === 'ArrowRight') onNav(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, onNav]);

  if (!open) return null;

  return (
    <div className="lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <button className="lightbox__close" onClick={onClose} aria-label="Close">&#10005;</button>
      <button
        className="lightbox__nav lightbox__nav--prev"
        onClick={(e) => { e.stopPropagation(); onNav(-1); }}
        aria-label="Previous photo"
      >&#8249;</button>

      <div className="lightbox__stage" onClick={(e) => e.stopPropagation()}>
        <img src={images[index]} alt="" />
        <SizePanel info={details && details[index]} />
      </div>

      <button
        className="lightbox__nav lightbox__nav--next"
        onClick={(e) => { e.stopPropagation(); onNav(1); }}
        aria-label="Next photo"
      >&#8250;</button>

      <div className="lightbox__counter">{index + 1} / {images.length}</div>
    </div>
  );
}

function SizePanel({ info }) {
  if (!info || !info.sizeMin) return null;
  return (
    <div className="size-panel">
      {info.id && <Link to={`/costumes/${info.id}`} className="btn btn-gold size-panel__book">{info.bookable ? 'Check dates & book' : 'View details'}</Link>}
      <p className="size-panel__title">
        Sizes {info.sizeMin}–{info.sizeMax} inches{info.total ? ` · ${info.total} pieces in total` : ''}
      </p>
      {info.sizes && info.sizes.length > 0 ? (
        <ul className="size-panel__list">
          {info.sizes.map((s) => (
            <li key={s.size}><strong>{s.size}</strong><span>{s.count} available</span></li>
          ))}
        </ul>
      ) : (
        <p className="size-panel__note">Ask us on WhatsApp for the count in each size.</p>
      )}
      <p className="size-panel__note">Stock changes as costumes go out on rent — please confirm availability with us.</p>
    </div>
  );
}
