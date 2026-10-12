import { Check, EyeOff, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { adminApi, type ApiReview } from '../../api';
import { StarsDisplay } from '../../components/Stars';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { formatDate } from '../../lib/image';

export default function AdminReviews() {
  const { token, logout } = useAdminAuth();
  const [reviews, setReviews] = useState<ApiReview[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setReviews(await adminApi.listReviews(token));
    } catch (err) {
      if (err instanceof Error && err.message.includes('токен')) logout();
      setError(err instanceof Error ? err.message : 'Не удалось загрузить отзывы');
    }
  }, [token, logout]);

  useEffect(() => {
    load();
  }, [load]);

  const setApproved = async (id: number, approved: boolean) => {
    if (!token) return;
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, approved: approved ? 1 : 0 } : r)));
    try {
      await adminApi.setReviewApproved(token, id, approved);
    } catch {
      load();
    }
  };

  const remove = async (id: number) => {
    if (!token || !window.confirm('Удалить отзыв?')) return;
    setReviews((prev) => prev.filter((r) => r.id !== id));
    try {
      await adminApi.deleteReview(token, id);
    } catch {
      load();
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#2E1F16] mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
        Отзывы
      </h1>
      <p className="text-sm text-[#7A6A52] mb-6">
        Новые отзывы появляются на сайте только после того, как вы их одобрите.
      </p>
      {error && <p className="text-[#B0503D] text-sm mb-4">{error}</p>}
      {reviews.length === 0 && <p className="text-sm text-[#7A6A52]">Отзывов пока нет.</p>}
      <div className="flex flex-col gap-4">
        {reviews.map((r) => (
          <div
            key={r.id}
            className="bg-[#FBF6EA] border rounded-2xl p-5"
            style={{ borderColor: r.approved ? '#E3D2A5' : '#B8934F' }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-[#2E1F16]">{r.name}</span>
                <StarsDisplay rating={r.rating} size={14} />
              </div>
              <span className="text-xs text-[#9A8A6C]">{formatDate(r.created_at)}</span>
            </div>
            {r.text && <p className="text-sm text-[#4A3A2C] whitespace-pre-line">{r.text}</p>}
            {r.photo && <img src={r.photo} alt="" className="mt-3 max-h-56 rounded-xl" />}
            <div className="flex gap-2 mt-4">
              {r.approved ? (
                <button
                  type="button"
                  onClick={() => setApproved(r.id, false)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-[#E3D2A5] text-[#4A3A2C]"
                >
                  <EyeOff size={13} /> Скрыть
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setApproved(r.id, true)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-[#2E1F16] text-white"
                >
                  <Check size={13} /> Опубликовать
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(r.id)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-[#E3D2A5] text-[#B0503D]"
              >
                <Trash2 size={13} /> Удалить
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
