import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/navbar.css';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile drawer on route/hash change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname, hash]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const isActive = (path) => {
    if (path.startsWith('/#')) {
      return pathname === '/' && hash === path.slice(1);
    }
    return pathname === path;
  };

  const handleLogout = () => {
    logout();
    navigate('/');
    setMobileMenuOpen(false);
  };

  return (
    <header className={`floating-nav-wrapper ${scrolled ? 'floating-nav-wrapper--scrolled' : ''}`}>
      <div className="floating-nav-container">
        <nav
          className="floating-nav"
          aria-label="Main Navigation"
        >
          {/* Brand Logo / Mark */}
          <Link
            to="/"
            className="floating-nav__brand"
            aria-label="Natya Vastra Home"
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="floating-nav__brand-symbol" aria-hidden="true">🪷</span>
            <span className="floating-nav__brand-name">Natya Vastra</span>
          </Link>

          {/* Desktop Navigation Links */}
          <div className="floating-nav__links">
            <Link
              to="/#collections"
              className={`floating-nav__link ${isActive('/#collections') ? 'floating-nav__link--active' : ''}`}
            >
              Collections
            </Link>
            <Link
              to="/browse"
              className={`floating-nav__link ${isActive('/browse') ? 'floating-nav__link--active' : ''}`}
            >
              Browse &amp; book
            </Link>
            <Link
              to="/assistant"
              className={`floating-nav__link ${isActive('/assistant') ? 'floating-nav__link--active' : ''}`}
            >
              <span>Ask assistant</span>
              <span className="floating-nav__sparkle" aria-hidden="true">✨</span>
            </Link>
            <Link
              to="/#gallery"
              className={`floating-nav__link ${isActive('/#gallery') ? 'floating-nav__link--active' : ''}`}
            >
              Gallery
            </Link>
            <Link
              to="/#contact"
              className={`floating-nav__link ${isActive('/#contact') ? 'floating-nav__link--active' : ''}`}
            >
              Contact
            </Link>
          </div>

          {/* Desktop Actions */}
          <div className="floating-nav__actions">
            {user ? (
              <>
                <Link
                  to={user.role === 'admin' ? '/admin' : '/account'}
                  className={`floating-nav__cta ${isActive(user.role === 'admin' ? '/admin' : '/account') ? 'floating-nav__cta--active' : ''}`}
                >
                  {user.role === 'admin' ? '⚙️ Admin' : '👤 My account'}
                </Link>
                <button
                  type="button"
                  className="floating-nav__logout-btn"
                  onClick={handleLogout}
                  title="Log out"
                >
                  Log out
                </button>
              </>
            ) : (
              <Link to="/login" className="floating-nav__cta">
                Log in
              </Link>
            )}
          </div>

          {/* Mobile Menu Hamburger Button */}
          <button
            type="button"
            className="floating-nav__mobile-toggle"
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span className={`hamburger-bar ${mobileMenuOpen ? 'hamburger-bar--open-1' : ''}`} />
            <span className={`hamburger-bar ${mobileMenuOpen ? 'hamburger-bar--open-2' : ''}`} />
            <span className={`hamburger-bar ${mobileMenuOpen ? 'hamburger-bar--open-3' : ''}`} />
          </button>
        </nav>
      </div>

      {/* Mobile Drawer Menu */}
      <div
        className={`floating-nav__drawer-backdrop ${mobileMenuOpen ? 'floating-nav__drawer-backdrop--open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
      />
      <div
        className={`floating-nav__drawer ${mobileMenuOpen ? 'floating-nav__drawer--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile Navigation"
      >
        <div className="floating-nav__drawer-header">
          <Link to="/" className="floating-nav__brand" onClick={() => setMobileMenuOpen(false)}>
            <span className="floating-nav__brand-symbol">🪷</span>
            <span className="floating-nav__brand-name">Natya Vastra</span>
          </Link>
          <button
            type="button"
            className="floating-nav__drawer-close"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            &times;
          </button>
        </div>
        <div className="floating-nav__drawer-links">
          <Link
            to="/#collections"
            className={`floating-nav__drawer-link ${isActive('/#collections') ? 'floating-nav__drawer-link--active' : ''}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            Collections
          </Link>
          <Link
            to="/browse"
            className={`floating-nav__drawer-link ${isActive('/browse') ? 'floating-nav__drawer-link--active' : ''}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            Browse &amp; book
          </Link>
          <Link
            to="/assistant"
            className={`floating-nav__drawer-link ${isActive('/assistant') ? 'floating-nav__drawer-link--active' : ''}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <span>Ask assistant ✨</span>
          </Link>
          <Link
            to="/#gallery"
            className={`floating-nav__drawer-link ${isActive('/#gallery') ? 'floating-nav__drawer-link--active' : ''}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            Gallery
          </Link>
          <Link
            to="/#contact"
            className={`floating-nav__drawer-link ${isActive('/#contact') ? 'floating-nav__drawer-link--active' : ''}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            Contact
          </Link>
        </div>
        <div className="floating-nav__drawer-footer">
          {user ? (
            <>
              <Link
                to={user.role === 'admin' ? '/admin' : '/account'}
                className="btn btn-primary floating-nav__drawer-cta"
                onClick={() => setMobileMenuOpen(false)}
              >
                {user.role === 'admin' ? '⚙️ Admin Dashboard' : '👤 My Account & Bookings'}
              </Link>
              <button
                type="button"
                className="btn btn-outline floating-nav__drawer-cta"
                onClick={handleLogout}
              >
                Log out ({user.name})
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="btn btn-primary floating-nav__drawer-cta"
              onClick={() => setMobileMenuOpen(false)}
            >
              Log in / Register
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
