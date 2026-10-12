import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';

export default function AdminLogin() {
  const { token, login } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (token) return <Navigate to="/admin" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F1E4C8] flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="ornate-frame w-full max-w-sm rounded-2xl bg-[#FBF6EA] px-8 py-10"
      >
        <h1
          className="text-2xl font-bold text-[#2E1F16] text-center mb-1"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          KAAFI · Admin
        </h1>
        <p className="text-sm text-[#7A6A52] text-center mb-6">Вход для персонала</p>

        <label className="block text-xs font-semibold uppercase tracking-wide text-[#7A6A52] mb-1.5">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          className="w-full mb-4 px-3.5 py-2.5 rounded-lg border border-[#E3D2A5] bg-white text-sm text-[#2E1F16] focus:outline-none focus:border-[#B8934F]"
        />

        <label className="block text-xs font-semibold uppercase tracking-wide text-[#7A6A52] mb-1.5">
          Пароль
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full mb-5 px-3.5 py-2.5 rounded-lg border border-[#E3D2A5] bg-white text-sm text-[#2E1F16] focus:outline-none focus:border-[#B8934F]"
        />

        {error && <p className="text-sm text-[#B0503D] mb-4 text-center">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-full font-semibold text-white bg-[#2E1F16] hover:bg-[#B8934F] transition-colors disabled:opacity-50"
        >
          {loading ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </div>
  );
}
