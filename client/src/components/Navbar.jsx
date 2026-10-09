import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/navbar.css';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const onHome = pathname === '/';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`navbar ${scrolled || !onHome ? 'navbar--solid' : ''}`}>
      <div className="container navbar__inner">
        <Link to="/" className="navbar__mark">Natya Vastra</Link>
        <nav className="navbar__links">
          <Link to="/#collections" className="navbar__opt">Collections</Link>
          <Link to="/browse">Browse &amp; book</Link>
          <Link to="/#gallery" className="navbar__opt">Gallery</Link>
          <Link to="/#contact" className="navbar__opt">Contact</Link>
          {user ? (
            <>
              <Link to={user.role === 'admin' ? '/admin' : '/account'} className="navbar__cta">
                {user.role === 'admin' ? 'Admin' : 'My account'}
              </Link>
              <button className="navbar__link-btn" onClick={() => { logout(); navigate('/'); }}>Log out</button>
            </>
          ) : (
            <Link to="/login" className="navbar__cta">Log in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
