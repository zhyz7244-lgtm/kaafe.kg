import { ArrowLeft, LogOut } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { customerApi, type CustomerMe } from '../api';
import QrCode from '../components/QrCode';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import { formatDate, formatSom } from '../lib/image';

const STATUS: Record<string, string> = {
  new: 'Новый',
  in_progress: 'В работе',
  done: 'Выполнен',
  cancelled: 'Отменён',
};

export default function Account() {
  const { token } = useCustomerAuth();
  return (
    <div className="min-h-screen bg-[#F1E4C8] px-4 py-8">
      <div className="max-w-md mx-auto">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-[#7A6A52] mb-6 hover:text-[#2E1F16]">
          <ArrowLeft size={16} /> На главную
        </Link>
        {token ? <Profile /> : <AuthForm />}
      </div>
    </div>
  );
}

function AuthForm() {
  const { login, register } = useCustomerAuth();
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') await register(name, phone, password);
      else await login(phone, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="ornate-frame rounded-2xl bg-[#FBF6EA] p-6 flex flex-col gap-3">
      <h1 className="text-2xl font-bold text-[#2E1F16] text-center" style={{ fontFamily: "'Playfair Display', serif" }}>
        {mode === 'register' ? 'Регистрация' : 'Вход'}
      </h1>
      <p className="text-sm text-[#7A6A52] text-center">
        Постоянным гостям — 1% бонусами с каждого заказа. Заказать можно и без регистрации.
      </p>
      {mode === 'register' && (
        <input required placeholder="Ваше имя" value={name} onChange={(e) => setName(e.target.value)} className="input" />
      )}
      <input
        required
        type="tel"
        placeholder="Номер телефона"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="input"
      />
      <input
        required
        type="password"
        placeholder={mode === 'register' ? 'Пароль (от 6 символов)' : 'Пароль'}
        minLength={mode === 'register' ? 6 : undefined}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="input"
      />
      {error && <p className="text-xs text-[#B0503D]">{error}</p>}
      <button type="submit" disabled={busy} className="py-3 rounded-full font-semibold text-white bg-[#2E1F16] disabled:opacity-50">
        {mode === 'register' ? 'Зарегистрироваться' : 'Войти'}
      </button>
      <button
        type="button"
        onClick={() => {
          setMode(mode === 'register' ? 'login' : 'register');
          setError(null);
        }}
        className="text-sm text-[#B8934F] underline"
      >
        {mode === 'register' ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
      </button>
    </form>
  );
}

function Profile() {
  const { token, logout, setProfile } = useCustomerAuth();
  const [me, setMe] = useState<CustomerMe | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    customerApi
      .me(token)
      .then((m) => {
        setMe(m);
        setProfile(m.profile);
      })
      .catch((err) => {
        // Expired / invalid session → back to the login form.
        setError(err instanceof Error ? err.message : 'Ошибка');
        logout();
      });
  }, [token, logout, setProfile]);

  if (error) return <p className="text-sm text-[#B0503D]">{error}</p>;
  if (!me) return <p className="text-sm text-[#7A6A52]">Загрузка…</p>;
  const { profile } = me;

  return (
    <div className="flex flex-col gap-5">
      <div className="ornate-frame rounded-2xl bg-[#FBF6EA] p-6 text-center">
        <h1 className="text-xl font-bold text-[#2E1F16]" style={{ fontFamily: "'Playfair Display', serif" }}>
          {profile.name}
        </h1>
        <p className="text-sm text-[#7A6A52] mb-4">+{profile.phone}</p>
        <div className="text-xs uppercase tracking-wide text-[#7A6A52]">Ваши бонусы</div>
        <div className="text-4xl font-bold text-[#B8934F] mb-4">{profile.bonus_balance}</div>
        <div className="flex justify-center mb-2">
          <QrCode value={`KAAFI-${profile.code}`} />
        </div>
        <div className="text-sm text-[#2E1F16] font-semibold tracking-widest">KAAFI-{profile.code}</div>
        <p className="text-xs text-[#9A8A6C] mt-2">
          Покажите QR-код на кассе. {me.bonusPercent}% от каждого выполненного заказа начисляется бонусами.
        </p>
      </div>

      <div className="bg-[#FBF6EA] border border-[#E3D2A5] rounded-2xl p-5">
        <h2 className="font-bold text-[#2E1F16] mb-3">История бонусов</h2>
        {me.transactions.length === 0 ? (
          <p className="text-sm text-[#7A6A52]">Пока пусто — бонусы появятся после первого выполненного заказа.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {me.transactions.map((t) => (
              <li key={t.id} className="flex justify-between gap-3">
                <span className="text-[#4A3A2C]">
                  {t.note}
                  <span className="block text-xs text-[#9A8A6C]">{formatDate(t.created_at)}</span>
                </span>
                <span className="font-bold" style={{ color: t.amount > 0 ? '#4F7A45' : '#B0503D' }}>
                  {t.amount > 0 ? '+' : ''}
                  {t.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-[#FBF6EA] border border-[#E3D2A5] rounded-2xl p-5">
        <h2 className="font-bold text-[#2E1F16] mb-3">Мои заказы</h2>
        {me.orders.length === 0 ? (
          <p className="text-sm text-[#7A6A52]">Заказов пока нет.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {me.orders.map((o) => (
              <li key={o.id} className="flex justify-between gap-3 text-[#4A3A2C]">
                <span>
                  №{o.id} · {formatDate(o.created_at)}
                </span>
                <span>
                  {formatSom(o.total)} · {STATUS[o.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={logout}
        className="self-center flex items-center gap-1.5 text-sm text-[#7A6A52] px-4 py-2 rounded-full border border-[#E3D2A5]"
      >
        <LogOut size={14} /> Выйти
      </button>
    </div>
  );
}
