import '../styles/hero.css';

const WA_NUMBER = '919900599872';

export default function Hero() {
  return (
    <section className="hero" id="top">
      <div className="container hero__grid">
        <div className="hero__text">
          <h1>Bharatanatyam Costumes for Rent</h1>
          <p className="hero__lede">
            Elegant, traditional, and easy on the budget — perfect for
            performances, exams, and every stage in between.
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
          <img src="/assets/images/costume-024.jpg" alt="A six-piece Bharatanatyam costume available to rent" />
        </div>
      </div>
    </section>
  );
}
