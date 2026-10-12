import { Plus } from 'lucide-react';
import { useCart } from '../context/CartContext';
import type { MenuItem } from '../types';

export default function MenuRow({ item }: { item: MenuItem }) {
  const { addItem } = useCart();

  return (
    <div className="flex items-center gap-2 sm:gap-3 py-3 border-b border-dashed border-[#E3D2A5] last:border-0">
      <span
        className="font-semibold text-[#2E1F16] whitespace-nowrap"
        style={{ fontFamily: "'Playfair Display', serif" }}
      >
        {item.name}
      </span>
      <span className="flex-1 border-b border-dotted border-[#C9B98A] translate-y-[-3px]" />
      <span className="text-xs text-[#9A8A6C] whitespace-nowrap">{item.volume}</span>
      <span className="w-4 sm:w-10 border-b border-dotted border-[#C9B98A] translate-y-[-3px]" />
      <span className="font-bold text-[#2E1F16] whitespace-nowrap w-14 text-right">
        {item.price} с
      </span>
      <button
        type="button"
        onClick={() => addItem(item)}
        className="w-7 h-7 rounded-full border border-[#B8934F] text-[#B8934F] hover:bg-[#B8934F] hover:text-white flex items-center justify-center transition-colors shrink-0"
        aria-label={`Добавить ${item.name} в корзину`}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
