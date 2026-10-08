import { useState } from 'react';
import Lightbox from './Lightbox.jsx';
import '../styles/categoryModal.css';

export default function CategoryModal({ category, onClose, onEnquire }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);

  if (!category) return null;

  const navLightbox = (delta) => {
    setLightboxIndex((i) => (i + delta + category.images.length) % category.images.length);
  };

  return (
    <div className="cat-modal" role="dialog" aria-modal="true">
      <div className="cat-modal__header" style={{ '--accent': category.accent_color }}>
        <div className="container cat-modal__header-inner">
          <button className="cat-modal__back" onClick={onClose}>&#8592; Back to collections</button>
          <h2>{category.name}</h2>
          <p>{category.description}</p>
          {category.note && (
            <p className="cat-modal__callout">{category.note}</p>
          )}
          <button className="btn btn-gold cat-modal__enquire" onClick={() => onEnquire(category.name)}>
            Enquire about this collection
          </button>
        </div>
      </div>

      <div className="container cat-modal__grid">
        {category.images.map((img, i) => (
          <button key={img.src} className="cat-modal__thumb" onClick={() => setLightboxIndex(i)}>
            <img src={img.src} alt={img.label || `${category.name} ${i + 1}`} loading="lazy" />
            {(img.label || img.sizeMin) && (
              <span className="cat-modal__thumb-label">
                {img.label && <span>{img.label}</span>}
                {img.sizeMin && <span>Sizes {img.sizeMin}–{img.sizeMax} in</span>}
              </span>
            )}
          </button>
        ))}
      </div>

      <Lightbox
        images={category.images.map((img) => img.src)}
        details={category.images}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNav={navLightbox}
      />
    </div>
  );
}
