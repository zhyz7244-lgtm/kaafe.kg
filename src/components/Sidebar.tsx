import { Clock, MapPin, User } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import InstagramIcon from './icons/InstagramIcon';

const NAV_LINKS = [
  { href: '#hero', label: 'Главная' },
  { href: '#menu', label: 'Меню' },
  { href: '#drinks', label: 'Напитки и еда' },
  { href: '#books', label: 'Книги' },
  { href: '#reviews', label: 'Отзывы' },
  { href: '#about', label: 'О нас' },
  { href: '#contacts', label: 'Контакты' },
];

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const { token } = useCustomerAuth();
  const accountLabel = token ? 'Мой профиль' : 'Войти / Регистрация';

  const handleNavClick = () => setOpen(false);

  return (
    <>
      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-16 bg-[#FBF6EA] border-b border-[#E3D2A5]">
        <a href="#hero" className="flex items-center gap-2">
          <LogoMark />
          <span
            className="text-lg font-bold tracking-[0.08em] text-[#2E1F16]"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            KAAFI
          </span>
        </a>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Открыть меню навигации"
          className="w-10 h-10 flex flex-col items-center justify-center gap-1.5"
        >
          <span
            className="block w-6 h-0.5 bg-[#2E1F16] transition-transform"
            style={{ transform: open ? 'translateY(4px) rotate(45deg)' : 'none' }}
          />
          <span
            className="block w-6 h-0.5 bg-[#2E1F16] transition-opacity"
            style={{ opacity: open ? 0 : 1 }}
          />
          <span
            className="block w-6 h-0.5 bg-[#2E1F16] transition-transform"
            style={{ transform: open ? 'translateY(-4px) rotate(-45deg)' : 'none' }}
          />
        </button>
      </header>

      {open && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/30" onClick={() => setOpen(false)}>
          <nav
            className="absolute top-16 left-0 right-0 bg-[#FBF6EA] border-b border-[#E3D2A5] px-4 py-4 flex flex-col gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={handleNavClick}
                className="px-3 py-2.5 rounded-lg text-[#2E1F16] font-medium hover:bg-[#F1E4C8]"
              >
                {link.label}
              </a>
            ))}
            <Link to="/account" className="px-3 py-2.5 rounded-lg text-[#B8934F] font-semibold hover:bg-[#F1E4C8]">
              {accountLabel}
            </Link>
          </nav>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 lg:h-screen lg:sticky lg:top-0 bg-[#FBF6EA] border-r border-[#E3D2A5] px-6 py-8">
        <a href="#hero" className="flex items-center gap-2.5 mb-10">
          <LogoMark />
          <div className="leading-tight">
            <div
              className="text-2xl font-bold tracking-[0.08em] text-[#2E1F16]"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              KAAFI
            </div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-[#B8934F] font-semibold">
              Books · Coffee
            </div>
          </div>
        </a>

        <nav className="flex flex-col gap-1">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="px-3 py-2.5 rounded-lg text-[#6B5A44] font-medium hover:bg-[#F1E4C8] hover:text-[#2E1F16] transition-colors"
            >
              {link.label}
            </a>
          ))}
          <Link
            to="/account"
            className="mt-2 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#2E1F16] text-white font-medium hover:bg-[#B8934F] transition-colors"
          >
            <User size={16} /> {accountLabel}
          </Link>
        </nav>

        <div className="mt-auto pt-6 border-t border-[#E3D2A5] flex flex-col gap-3 text-sm text-[#7A6A52]">
          <div className="flex items-start gap-2">
            <MapPin size={16} className="mt-0.5 shrink-0" />
            <span>ул. Анкара 46, Бишкек</span>
          </div>
          <div className="flex items-start gap-2">
            <Clock size={16} className="mt-0.5 shrink-0" />
            <span>Ежедневно 9:00–22:00</span>
          </div>
          <a
            href="https://www.instagram.com/kaafi_kg"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 hover:text-[#B8934F] transition-colors"
          >
            <InstagramIcon size={16} />
            <span>@kaafi_kg</span>
          </a>
        </div>
      </aside>
    </>
  );
}

function LogoMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <circle cx="15" cy="15" r="13.5" stroke="#B8934F" strokeWidth="1.4" />
      <circle cx="15" cy="15" r="11" stroke="#B8934F" strokeWidth="0.6" />
      <path
        d="M15 8C15 10.5 11.5 12 11.5 16.5C11.5 19.8 12.9 22 15 22C17.1 22 18.5 19.8 18.5 16.5C18.5 14.7 17.8 13.6 17.3 12.6C17.5 14 16.6 14.8 16.1 14.4C15.6 14 16 12.6 15 8Z"
        fill="#2E1F16"
      />
    </svg>
  );
}
