import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { menuApi, type ApiMenuItem } from '../api';
import type { MenuCategory } from '../types';
import MenuRow from './MenuRow';
import Ornament from './Ornament';

const GROUPS: { id: MenuCategory; label: string }[] = [
  { id: 'hot', label: 'Кофе' },
  { id: 'iced', label: 'Холодный кофе' },
];

export default function MenuSection() {
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<ApiMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    menuApi
      .list()
      .then((items) => {
        if (!cancelled) setMenu(items);
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось загрузить меню. Попробуйте обновить страницу.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(
    () => menu.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase())),
    [menu, query],
  );

  return (
    <section id="menu" className="px-4 sm:px-10 py-14 max-w-3xl mx-auto">
      <Ornament label="Меню" />
      <h2
        className="text-3xl sm:text-4xl font-bold text-[#2E1F16] text-center mb-2"
        style={{ fontFamily: "'Playfair Display', serif" }}
      >
        Меню
      </h2>
      <p className="text-[#7A6A52] text-sm text-center mb-8">
        Свежая обжарка каждый день · Анкара 46, Бишкек
      </p>

      <div className="relative max-w-xs mx-auto mb-10">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B8934F]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти напиток…"
          className="w-full pl-10 pr-4 py-2.5 rounded-full border border-[#E3D2A5] bg-[#FBF6EA] text-sm text-[#2E1F16] placeholder:text-[#B3A38D] focus:outline-none focus:border-[#B8934F] text-center"
        />
      </div>

      {loading ? (
        <p className="text-[#8A7863] text-sm py-10 text-center">Загружаем меню…</p>
      ) : error ? (
        <p className="text-[#B0503D] text-sm py-10 text-center">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="text-[#8A7863] text-sm py-10 text-center">
          Ничего не найдено — попробуйте другой запрос.
        </p>
      ) : (
        <div className="ornate-frame rounded-2xl bg-[#FBF6EA] px-6 sm:px-10 py-8 sm:py-10">
          {GROUPS.map((group) => {
            const items = filtered.filter((item) => item.category === group.id);
            if (items.length === 0) return null;
            return (
              <div key={group.id} className="mb-8 last:mb-0">
                <h3
                  className="text-lg font-bold text-[#B8934F] uppercase tracking-[0.15em] text-center mb-4"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  {group.label}
                </h3>
                <div>
                  {items.map((item) => (
                    <MenuRow key={item.id} item={item} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
