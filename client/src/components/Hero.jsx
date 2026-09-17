import '../styles/hero.css';

const WA_NUMBER = '919900599872';

export default function Hero() {
  return (
    <section className="hero" id="top">
      <div className="container hero__grid">
        <div className="hero__text">
          <h1>Stitched for the stage, not the shelf.</h1>
          <p className="hero__lede">
            Every Natya Vastra costume is cut and finished by hand in our Bengaluru
            workshop, to your measurements — from a first practice frock to an
            arangetram set.
          </p>
          <div className="hero__actions">
            <a href="#collections" className="btn btn-primary">See the collections</a>
            <a
              href={`https://wa.me/${WA_NUMBER}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline"
            >
              Message us on WhatsApp
            </a>
          </div>
        </div>
        <div className="hero__figure">
          <img src="/assets/images/costume-024.jpg" alt="A hand-finished six-piece Bharatanatyam costume" />
        </div>
      </div>
    </section>
  );
}
