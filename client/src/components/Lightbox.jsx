import { useEffect } from 'react';
import '../styles/lightbox.css';

export default function Lightbox({ images, index, onClose, onNav }) {
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

      <img
        src={images[index]}
        alt=""
        onClick={(e) => e.stopPropagation()}
      />

      <button
        className="lightbox__nav lightbox__nav--next"
        onClick={(e) => { e.stopPropagation(); onNav(1); }}
        aria-label="Next photo"
      >&#8250;</button>

      <div className="lightbox__counter">{index + 1} / {images.length}</div>
    </div>
  );
}
