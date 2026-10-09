import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from;

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const destination = (u) => (from ? `${from.pathname}${from.search || ''}` : u.role === 'admin' ? '/admin' : '/account');
  if (user) return <Navigate to={destination(user)} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const u = isRegister ? await register(form) : await login(form.email, form.password);
      navigate(destination(u), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <div className="container">
        <form className="auth-card" onSubmit={submit}>
          <h1 className="page-title">{isRegister ? 'Create your account' : 'Welcome back'}</h1>
          <p className="auth-card__sub">{isRegister ? 'Book costumes, save favourites and track your rentals.' : 'Log in to book costumes and see your rentals.'}</p>

          {isRegister && (
            <label className="field"><span>Full name</span>
              <input value={form.name} onChange={update('name')} autoComplete="name" required /></label>
          )}
          <label className="field"><span>Email</span>
            <input type="email" value={form.email} onChange={update('email')} autoComplete="email" required /></label>
          {isRegister && (
            <label className="field"><span>Phone / WhatsApp (optional)</span>
              <input value={form.phone} onChange={update('phone')} autoComplete="tel" placeholder="+91 XXXXX XXXXX" /></label>
          )}
          <label className="field"><span>Password</span>
            <input type="password" value={form.password} onChange={update('password')} minLength={isRegister ? 8 : undefined}
                   autoComplete={isRegister ? 'new-password' : 'current-password'} required />
            {isRegister && <small className="form-hint">At least 8 characters.</small>}
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'}</button>

          <p className="auth-card__switch">
            {isRegister
              ? <>Already have an account? <Link to="/login" state={location.state}>Log in</Link></>
              : <>New here? <Link to="/register" state={location.state}>Create an account</Link></>}
          </p>
        </form>
      </div>
    </main>
  );
}
