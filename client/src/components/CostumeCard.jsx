import { Link, useLocation, useNavigate } from 'react-router-dom';
import { assetUrl } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export const costumeTitle = (c) => c.name || `${c.categoryName} · Design ${c.designNo}`;
export const sizeText = (c) => (c.sizeMin ? `Sizes ${c.sizeMin}–${c.sizeMax} in` : 'Sizes on request');

export default function CostumeCard({ costume: c }) {
  const { user, wishlist, toggleWishlist } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const saved = wishlist.has(c.id);

  const onHeart = async (e) => {
    e.preventDefault();
    const ok = await toggleWishlist(c.id);
    if (!ok) navigate('/login', { state: { from: location } });
  };

  return (
    <Link to={`/costumes/${c.id}`} className="costume-card">
      <div className="costume-card__img">
        <img src={assetUrl(c.src)} alt={costumeTitle(c)} loading="lazy" />
        <button
          className={`heart ${saved ? 'heart--on' : ''}`}
          onClick={onHeart}
          aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
          aria-pressed={saved}
          title={user ? (saved ? 'Remove from wishlist' : 'Save to wishlist') : 'Log in to save'}
        >{saved ? '♥' : '♡'}</button>
        {c.availableForDates && <span className="badge badge--ok">Free for your dates</span>}
      </div>
      <div className="costume-card__body">
        <h3>{costumeTitle(c)}</h3>
        <p>{sizeText(c)}</p>
        <p className="costume-card__price">{c.rentPrice ? `₹${c.rentPrice} / day` : (c.bookable ? 'Price on request' : 'Enquire to book')}</p>
      </div>
    </Link>
  );
}
