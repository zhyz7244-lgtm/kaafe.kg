import {
  Bike,
  Minus,
  Plus,
  ShoppingBag,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import type { OrderMode } from '../types';

const MODES: { id: OrderMode; label: string; icon: typeof Bike }[] = [
  { id: 'delivery', label: 'Доставка', icon: Bike },
  { id: 'dine-in', label: 'В зале', icon: UtensilsCrossed },
  { id: 'takeaway', label: 'С собой', icon: ShoppingBag },
];

function CartContents() {
  const {
    lines,
    orderMode,
    setOrderMode,
    details,
    setDetails,
    incrementItem,
    decrementItem,
    removeItem,
    total,
    placeOrder,
    placing,
    placeError,
    placedOrderId,
    placedBonus,
  } = useCart();
  const { token: customerToken } = useCustomerAuth();

  return (
    <>
      <h2
        className="text-xl font-bold text-[#2E1F16] mb-4 text-center"
        style={{ fontFamily: "'Playfair Display', serif" }}
      >
        Ваш заказ
      </h2>

      <div className="flex gap-2 mb-5">
        {MODES.map((mode) => {
          const Icon = mode.icon;
          const active = orderMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => setOrderMode(mode.id)}
              className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-medium transition-colors"
              style={{
                backgroundColor: active ? '#2E1F16' : '#F1E4C8',
                color: active ? '#FFFFFF' : '#4A3A2C',
              }}
            >
              <Icon size={16} />
              {mode.label}
            </button>
          );
        })}
      </div>

      {lines.length === 0 ? (
        <p className="text-sm text-[#7A6A52] py-8 text-center">
          {placedOrderId
            ? `Заказ №${placedOrderId} оформлен — спасибо!${placedBonus > 0 ? ` После выполнения вам начислится ${placedBonus} бонусов.` : ''}`
            : 'Корзина пуста. Добавьте напитки из меню.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3 mb-5">
          {lines.map((line) => (
            <div key={line.item.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-semibold text-[#2E1F16] truncate"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  {line.item.name}
                </p>
                <p className="text-xs text-[#9A8A6C]">
                  {line.item.volume} · {line.item.price} с
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => decrementItem(line.item.id)}
                  className="w-6 h-6 rounded-full border border-[#E3D2A5] flex items-center justify-center text-[#4A3A2C] hover:bg-[#F1E4C8]"
                  aria-label="Уменьшить количество"
                >
                  <Minus size={12} />
                </button>
                <span className="w-5 text-center text-sm text-[#2E1F16]">{line.qty}</span>
                <button
                  type="button"
                  onClick={() => incrementItem(line.item.id)}
                  className="w-6 h-6 rounded-full border border-[#E3D2A5] flex items-center justify-center text-[#4A3A2C] hover:bg-[#F1E4C8]"
                  aria-label="Увеличить количество"
                >
                  <Plus size={12} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeItem(line.item.id)}
                className="text-[#B3A38D] hover:text-[#B8934F]"
                aria-label="Удалить"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {orderMode === 'dine-in' && (
        <input
          required
          value={details.tableNumber}
          onChange={(e) => setDetails({ ...details, tableNumber: e.target.value })}
          placeholder="Номер стола"
          inputMode="numeric"
          className="input w-full mb-3"
        />
      )}
      {orderMode === 'delivery' && (
        <div className="flex flex-col gap-2 mb-3">
          <input
            type="tel"
            value={details.phone}
            onChange={(e) => setDetails({ ...details, phone: e.target.value })}
            placeholder="Телефон"
            className="input"
          />
          <input
            value={details.address}
            onChange={(e) => setDetails({ ...details, address: e.target.value })}
            placeholder="Адрес доставки"
            className="input"
          />
        </div>
      )}
      <input
        value={details.comment}
        onChange={(e) => setDetails({ ...details, comment: e.target.value })}
        placeholder="Комментарий к заказу (необязательно)"
        className="input w-full mb-4"
      />

      {!customerToken && (
        <p className="text-xs text-[#7A6A52] text-center mb-3">
          Заказывайте без регистрации или{' '}
          <Link to="/account" className="text-[#B8934F] underline">
            зарегистрируйтесь
          </Link>
          , чтобы копить 1% бонусами.
        </p>
      )}

      <div className="border-t border-dashed border-[#E3D2A5] pt-4 mb-4 flex items-center justify-between">
        <span className="text-sm text-[#7A6A52]">Итого</span>
        <span className="text-lg font-bold text-[#2E1F16]">{total} с</span>
      </div>

      <button
        type="button"
        disabled={lines.length === 0 || placing}
        onClick={placeOrder}
        className="w-full py-3 rounded-full font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ backgroundColor: '#2E1F16' }}
      >
        {placing ? 'Оформляем…' : 'Оформить заказ'}
      </button>
      {placeError && (
        <p className="text-xs text-center text-[#B0503D] mt-2">{placeError}</p>
      )}
      {placedOrderId && !placeError && (
        <p className="text-xs text-center text-[#9A8A6C] mt-2">
          Онлайн-оплата подключается отдельно — оплата на месте.
        </p>
      )}
    </>
  );
}

export default function CartPanel() {
  const { count } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sticky panel */}
      <aside className="hidden lg:block lg:w-80 lg:shrink-0 lg:sticky lg:top-8 lg:self-start lg:mr-6 lg:mt-6 ornate-frame rounded-2xl bg-[#FBF6EA] p-5">
        <CartContents />
      </aside>

      {/* Mobile floating button */}
      {count > 0 && !mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="lg:hidden fixed bottom-5 right-5 z-40 flex items-center gap-2 bg-[#2E1F16] text-white px-5 py-3 rounded-full shadow-lg"
        >
          <ShoppingBag size={18} />
          <span className="text-sm font-semibold">Корзина · {count}</span>
        </button>
      )}

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="relative w-full bg-[#FBF6EA] border-t-2 border-[#B8934F] rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 text-[#7A6A52]"
              aria-label="Закрыть корзину"
            >
              <X size={20} />
            </button>
            <CartContents />
          </div>
        </div>
      )}
    </>
  );
}
