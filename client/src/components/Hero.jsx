import { Link } from 'react-router-dom';
import '../styles/hero.css';

const WA_NUMBER = '919900599872';

export default function Hero() {
  return (
    <section className="hero" id="top">
      <div className="container hero__grid">
        <div className="hero__text">
          <div className="hero__badge">
            <span className="hero__badge-dot" />
            <span>Bengaluru’s Bharatanatyam Costume Rental &amp; Tailoring</span>
          </div>
          <h1>Made for the Stage, Not the Shelf.</h1>
          <p className="hero__lede">
            Every performance deserves a costume that tells a story. Celebrate the timeless
            beauty of Bharatanatyam with exquisite traditional attire, available for rent to
            make every recital, examination, and stage appearance truly unforgettable — where
            heritage meets elegance, without the premium price tag.
          </p>
          <div className="hero__actions">
            <Link to="/browse" className="btn btn-primary hero__cta-main">
              <span>Browse &amp; book online</span>
              <span className="btn-arrow" aria-hidden="true">→</span>
            </Link>
            <a
              href={`https://wa.me/${WA_NUMBER}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline hero__cta-wa"
            >
              <span className="wa-icon" aria-hidden="true">💬</span>
              <span>Message us on WhatsApp</span>
            </a>
          </div>
          <div className="hero__trust">
            <div className="hero__trust-item">
              <strong>36+ Designs</strong>
              <span>7 Classical Styles</span>
            </div>
            <div className="hero__trust-divider" />
            <div className="hero__trust-item">
              <strong>₹650/day</strong>
              <span>Standard Rental</span>
            </div>
            <div className="hero__trust-divider" />
            <div className="hero__trust-item">
              <strong>Sizes 24–40</strong>
              <span>Checked by Day</span>
            </div>
          </div>
        </div>
        <div className="hero__figure-wrap">
          <div className="hero__figure-glow" aria-hidden="true" />
          <figure className="hero__figure">
            <img
              src="/assets/images/costume-024.jpg"
              alt="A six-piece Bharatanatyam classical dance costume available to rent at Natya Vastra"
              loading="eager"
            />
            <figcaption className="hero__figure-caption">
              <span className="hero__figure-tag">Featured Collection</span>
              <span className="hero__figure-name">Six-Piece Silk Costume · Design 24</span>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
