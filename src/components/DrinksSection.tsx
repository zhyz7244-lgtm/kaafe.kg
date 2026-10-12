import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { menuApi, type ApiMenuItem } from '../api';
import { useCart } from '../context/CartContext';
import { formatSom } from '../lib/image';
import type { MenuCategory } from '../types';
import Ornament from './Ornament';

const GROUPS: { id: MenuCategory; label: string }[] = [
  { id: 'drink', label: 'Напитки' },
  { id: 'mojito', label: 'Мохито' },
  { id: 'food', label: 'Еда' },
];

export default function DrinksSection() {
  const { addItem } = useCart();
  const [items, setItems] = useState<ApiMenuItem[]>([]);

  useEffect(() => {
    menuApi.list().then(setItems).catch(() => {});
  }, []);

  const groups = GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.category === g.id) })).filter(
    (g) => g.items.length > 0,
  );
  if (groups.length === 0) return null;

  return (
    <section id="drinks" className="px-4 sm:px-10 py-14 max-w-3xl mx-auto">
      <Ornament label="Напитки и еда" />
      <h2
        className="text-3xl sm:text-4xl font-bold text-[#2E1F16] text-center mb-8"
        style={{ fontFamily: "'Playfair Display', serif" }}
      >
        Напитки и еда
      </h2>

      {groups.map((group) => (
        <div key={group.id} className="mb-10 last:mb-0">
          <h3
            className="text-lg font-bold text-[#B8934F] uppercase tracking-[0.15em] text-center mb-4"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {group.label}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {group.items.map((item) => (
              <article
                key={item.id}
                className="bg-[#FBF6EA] border border-[#E3D2A5] rounded-2xl overflow-hidden flex flex-col"
              >
                {item.photo && (
                  <img src={item.photo} alt={item.name} loading="lazy" className="w-full h-44 object-cover" />
                )}
                <div className="p-4 flex flex-col gap-1 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <h4
                      className="font-semibold text-[#2E1F16]"
                      style={{ fontFamily: "'Playfair Display', serif" }}
                    >
                      {item.name}
                    </h4>
                    <span className="font-bold text-[#2E1F16] whitespace-nowrap">{formatSom(item.price)}</span>
                  </div>
                  {item.volume && <span className="text-xs text-[#9A8A6C]">{item.volume}</span>}
                  {item.description && <p className="text-sm text-[#7A6A52]">{item.description}</p>}
                  <button
                    type="button"
                    onClick={() => addItem(item)}
                    className="mt-auto pt-3 self-start flex items-center gap-1.5 text-sm font-semibold text-[#B8934F] hover:text-[#2E1F16]"
                  >
                    <Plus size={14} /> В корзину
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
