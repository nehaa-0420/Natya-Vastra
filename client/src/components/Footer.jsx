import '../styles/footer.css';

export default function Footer() {
  return (
    <footer className="site-footer">
      <p>&copy; {new Date().getFullYear()} <span>Natya Vastra</span> · Bengaluru · Handcrafted Bharatanatyam Costumes</p>
    </footer>
  );
}
