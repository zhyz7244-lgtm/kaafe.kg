import { createContext, useContext, useMemo, useState } from 'react';
import { ordersApi, type OrderDetails } from '../api';
import { useCustomerAuth } from './CustomerAuthContext';
import type { CartLine, MenuItem, OrderMode } from '../types';

interface CartContextValue {
  lines: CartLine[];
  orderMode: OrderMode;
  setOrderMode: (mode: OrderMode) => void;
  details: OrderDetails;
  setDetails: (details: OrderDetails) => void;
  addItem: (item: MenuItem) => void;
  incrementItem: (id: string) => void;
  decrementItem: (id: string) => void;
  removeItem: (id: string) => void;
  total: number;
  count: number;
  placeOrder: () => Promise<void>;
  placing: boolean;
  placeError: string | null;
  placedOrderId: number | null;
  placedBonus: number;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { token: customerToken } = useCustomerAuth();
  const [placedBonus, setPlacedBonus] = useState(0);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [orderMode, setOrderMode] = useState<OrderMode>('dine-in');
  const [details, setDetails] = useState<OrderDetails>({ tableNumber: '', phone: '', address: '', comment: '' });
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [placedOrderId, setPlacedOrderId] = useState<number | null>(null);

  const addItem = (item: MenuItem) => {
    setPlacedOrderId(null);
    setLines((prev) => {
      const existing = prev.find((line) => line.item.id === item.id);
      if (existing) {
        return prev.map((line) =>
          line.item.id === item.id ? { ...line, qty: line.qty + 1 } : line,
        );
      }
      return [...prev, { item, qty: 1 }];
    });
  };

  const incrementItem = (id: string) => {
    setLines((prev) =>
      prev.map((line) =>
        line.item.id === id ? { ...line, qty: line.qty + 1 } : line,
      ),
    );
  };

  const decrementItem = (id: string) => {
    setLines((prev) =>
      prev
        .map((line) =>
          line.item.id === id ? { ...line, qty: line.qty - 1 } : line,
        )
        .filter((line) => line.qty > 0),
    );
  };

  const removeItem = (id: string) => {
    setLines((prev) => prev.filter((line) => line.item.id !== id));
  };

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + line.item.price * line.qty, 0),
    [lines],
  );
  const count = useMemo(
    () => lines.reduce((sum, line) => sum + line.qty, 0),
    [lines],
  );

  const placeOrder = async () => {
    if (lines.length === 0) return;
    setPlacing(true);
    setPlaceError(null);
    try {
      const res = await ordersApi.place(orderMode, lines, details, customerToken);
      setPlacedOrderId(res.id);
      setPlacedBonus(res.bonus);
      setLines([]);
    } catch (err) {
      setPlaceError(err instanceof Error ? err.message : 'Не удалось оформить заказ');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <CartContext.Provider
      value={{
        lines,
        orderMode,
        setOrderMode,
        details,
        setDetails,
        addItem,
        incrementItem,
        decrementItem,
        removeItem,
        total,
        count,
        placeOrder,
        placing,
        placeError,
        placedOrderId,
        placedBonus,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
