import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { adminApi, type ApiOrder, type OrderStatus } from '../../api';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { formatDate } from '../../lib/image';
import { STATUS_COLOR, STATUS_LABEL } from './status';

const MODE_LABEL: Record<string, string> = {
  delivery: 'Доставка',
  'dine-in': 'В зале',
  takeaway: 'С собой',
};

export default function AdminOrders() {
  const { token, logout } = useAdminAuth();
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setOrders(await adminApi.listOrders(token));
    } catch (err) {
      if (err instanceof Error && err.message.includes('токен')) logout();
      setError(err instanceof Error ? err.message : 'Не удалось загрузить заказы');
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStatusChange = async (id: number, status: OrderStatus) => {
    if (!token) return;
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    try {
      await adminApi.setOrderStatus(token, id, status);
    } catch {
      load();
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#2E1F16]" style={{ fontFamily: "'Playfair Display', serif" }}>
          Заказы
        </h1>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-1.5 text-sm text-[#4A3A2C] px-3 py-1.5 rounded-full border border-[#E3D2A5] hover:bg-[#F1E4C8]"
        >
          <RefreshCw size={14} /> Обновить
        </button>
      </div>

      {loading ? (
        <p className="text-[#7A6A52] text-sm">Загрузка…</p>
      ) : error ? (
        <p className="text-[#B0503D] text-sm">{error}</p>
      ) : orders.length === 0 ? (
        <p className="text-[#7A6A52] text-sm">Заказов пока нет.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map((order) => (
            <div key={order.id} className="bg-[#FBF6EA] border border-[#E3D2A5] rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-bold text-[#2E1F16]">Заказ №{order.id}</span>
                  {order.table_number && (
                    <span className="text-sm font-bold text-white bg-[#B8934F] px-2.5 py-0.5 rounded-full">
                      Стол {order.table_number}
                    </span>
                  )}
                  <span className="text-sm text-[#7A6A52]">{MODE_LABEL[order.mode] || order.mode}</span>
                  <span className="text-sm text-[#7A6A52]">{formatDate(order.created_at)}</span>
                </div>
                <select
                  value={order.status}
                  onChange={(e) => handleStatusChange(order.id, e.target.value as OrderStatus)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full border-0 text-white"
                  style={{ backgroundColor: STATUS_COLOR[order.status] }}
                >
                  {Object.entries(STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1 mb-3">
                {order.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm text-[#4A3A2C]">
                    <span>
                      {item.name} <span className="text-[#9A8A6C]">× {item.qty}</span>
                    </span>
                    <span>{item.price * item.qty} с</span>
                  </div>
                ))}
              </div>

              {(order.phone || order.address || order.comment) && (
                <div className="text-sm text-[#7A6A52] mb-3">
                  {order.phone && <div>📞 {order.phone}</div>}
                  {order.address && <div>📍 {order.address}</div>}
                  {order.comment && <div>💬 {order.comment}</div>}
                </div>
              )}

              <div className="text-right font-bold text-[#2E1F16]">Итого: {order.total} с</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
