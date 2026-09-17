import '../styles/collections.css';

export default function Collections({ categories, loading, error, onSelect }) {
  return (
    <section className="collections" id="collections">
      <div className="container">
        <div className="section-heading">
          <h2>Collections, stitched to order</h2>
          <p>Seven silhouettes, each cut and finished by hand — pick one to see it up close.</p>
        </div>

        {loading && <p className="collections__status">Loading the collections…</p>}
        {error && (
          <p className="collections__status collections__status--error">
            Couldn't load the collections right now ({error}). Is the backend running?
          </p>
        )}

        {!loading && !error && (
          <div className="collections__grid">
            {categories.map((cat) => (
              <button
                key={cat.id}
                className="cat-card"
                style={{ '--accent': cat.accent_color }}
                onClick={() => onSelect(cat)}
              >
                <img src={cat.images[0]} alt={cat.name} loading="lazy" />
                <span className="cat-card__scrim" />
                <span className="cat-card__body">
                  <span className="cat-card__name">{cat.name}</span>
                  <span className="cat-card__desc">{cat.description}</span>
                  <span className="cat-card__count">{cat.images.length} photos</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
