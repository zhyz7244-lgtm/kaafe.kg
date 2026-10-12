import { Bell, LogOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { adminApi, type AdminCounts } from '../../api';
import { useAdminAuth } from '../../context/AdminAuthContext';

const POLL_MS = 10000;

// Short two-tone beep, generated so no audio file is needed.
function beep() {
  try {
    const ctx = new AudioContext();
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.2);
      osc.stop(ctx.currentTime + i * 0.2 + 0.18);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {
    // audio can be blocked before the first click — the banner still shows
  }
}

export default function AdminLayout() {
  const { token, email, logout } = useAdminAuth();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<AdminCounts | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const last = useRef<{ order: number; book: number } | null>(null);

  useEffect(() => {
    if (!token) return;
    let stopped = false;
    const tick = async () => {
      try {
        const c = await adminApi.counts(token);
        if (stopped) return;
        setCounts(c);
        const prev = last.current;
        if (prev) {
          if (c.lastOrderId > prev.order) setAlert('Новый заказ в кофейне!');
          else if (c.lastBookOrderId > prev.book) setAlert('Новый заказ книги!');
          if (c.lastOrderId > prev.order || c.lastBookOrderId > prev.book) beep();
        }
        last.current = { order: c.lastOrderId, book: c.lastBookOrderId };
      } catch {
        // ignore transient errors; the pages show their own errors
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [token]);

  if (!token) return <Navigate to="/admin/login" replace />;

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 min-h-10 inline-flex items-center rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
      isActive ? 'bg-[#2E1F16] text-white' : 'text-[#4A3A2C] hover:bg-[#F1E4C8]'
    }`;

  const badge = (n?: number) =>
    n ? (
      <span className="ml-1.5 inline-flex min-w-5 h-5 px-1 items-center justify-center rounded-full bg-[#B0503D] text-white text-[11px]">
        {n}
      </span>
    ) : null;

  return (
    <div className="min-h-screen bg-[#F1E4C8]">
      <header className="sticky top-0 z-30 border-b border-[#E3D2A5] bg-[#FBF6EA]">
        <div className="px-4 sm:px-8 py-3 flex items-center justify-between gap-3">
          <span className="text-lg font-bold text-[#2E1F16]" style={{ fontFamily: "'Playfair Display', serif" }}>
            KAAFI · Admin
          </span>
          <div className="flex items-center gap-3 text-sm text-[#7A6A52]">
            <span className="hidden sm:inline">{email}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 min-h-10 rounded-full border border-[#E3D2A5] hover:bg-[#F1E4C8] text-[#4A3A2C]"
            >
              <LogOut size={14} /> Выйти
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 sm:px-8 pb-3 [scrollbar-width:none]">
          <NavLink to="/admin/orders" className={linkClass}>
            Заказы{badge(counts?.orders)}
          </NavLink>
          <NavLink to="/admin/stats" className={linkClass}>
            Статистика
          </NavLink>
          <NavLink to="/admin/menu" className={linkClass}>
            Меню
          </NavLink>
          <NavLink to="/admin/books" className={linkClass}>
            Книги{badge(counts?.bookOrders)}
          </NavLink>
          <NavLink to="/admin/customers" className={linkClass}>
            Клиенты
          </NavLink>
          <NavLink to="/admin/reviews" className={linkClass}>
            Отзывы{badge(counts?.reviews)}
          </NavLink>
        </nav>
      </header>

      {alert && (
        <div className="bg-[#B8934F] text-white px-4 sm:px-8 py-3 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-semibold">
            <Bell size={16} /> {alert}
          </span>
          <span className="flex gap-3 text-sm">
            <button
              type="button"
              className="underline"
              onClick={() => {
                navigate(alert.includes('книги') ? '/admin/books' : '/admin/orders');
                setAlert(null);
                // Reload so the list shows the new order.
                window.location.reload();
              }}
            >
              Открыть
            </button>
            <button type="button" onClick={() => setAlert(null)}>
              Закрыть
            </button>
          </span>
        </div>
      )}

      <main className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
