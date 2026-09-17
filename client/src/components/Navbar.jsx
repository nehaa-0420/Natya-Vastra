import { useEffect, useState } from 'react';
import '../styles/navbar.css';

const LINKS = [
  { href: '#collections', label: 'Collections' },
  { href: '#gallery', label: 'Gallery' },
  { href: '#contact', label: 'Order' }
];

export default function Navbar() {
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`navbar ${solid ? 'navbar--solid' : ''}`}>
      <div className="container navbar__inner">
        <a href="#top" className="navbar__mark">Natya Vastra</a>
        <nav className="navbar__links">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href}>{link.label}</a>
          ))}
          <a href="#contact" className="navbar__cta">Enquire</a>
        </nav>
      </div>
    </header>
  );
}
