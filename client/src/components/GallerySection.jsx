import { useState } from 'react';
import Lightbox from './Lightbox.jsx';
import '../styles/gallery.css';

export default function GallerySection({ images, loading, error }) {
  const [index, setIndex] = useState(null);

  const nav = (delta) => setIndex((i) => (i + delta + images.length) % images.length);

  return (
    <section className="gallery-section" id="gallery">
      <div className="container">
        <div className="section-heading">
          <h2>From the workshop floor</h2>
          <p>A closer look at recent pieces, photographed before they left for the stage.</p>
        </div>

        {loading && <p className="collections__status">Loading the gallery…</p>}
        {error && (
          <p className="collections__status collections__status--error">
            Couldn't load the gallery right now ({error}).
          </p>
        )}

        {!loading && !error && (
          <div className="gallery-grid">
            {images.map((src, i) => (
              <button key={src} className="gallery-grid__item" onClick={() => setIndex(i)}>
                <img src={src} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>

      <Lightbox images={images} index={index} onClose={() => setIndex(null)} onNav={nav} />
    </section>
  );
}
