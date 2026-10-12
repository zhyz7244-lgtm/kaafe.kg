import { useCallback, useEffect, useState } from 'react';
import { adminApi, type ApiStats, type StatsBucket } from '../../api';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { formatSom } from '../../lib/image';

const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

function delta(cur: number, prev: number) {
  if (prev === 0) return cur === 0 ? null : { text: 'новое', up: true };
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { text: `${pct > 0 ? '+' : ''}${pct}%`, up: pct >= 0 };
}

function CompareCard({
  title,
  curLabel,
  prevLabel,
  cur,
  prev,
}: {
  title: string;
  curLabel: string;
  prevLabel: string;
  cur: StatsBucket;
  prev: StatsBucket;
}) {
  const d = delta(cur.revenue, prev.revenue);
  return (
    <div className="bg-[#FBF6EA] border border-[#E3D2A5] rounded-2xl p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-[#7A6A52] mb-2">{title}</div>
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-bold text-[#2E1F16]">{formatSom(cur.revenue)}</span>
        {d && (
          <span className="text-sm font-semibold" style={{ color: d.up ? '#4F7A45' : '#B0503D' }}>
            {d.text}
          </span>
        )}
      </div>
      <div className="text-sm text-[#7A6A52]">
        {curLabel}: {cur.orders} зак. (кофейня {cur.cafeOrders}, книги {cur.bookOrders})
      </div>
      <div className="text-sm text-[#9A8A6C] mt-2 pt-2 border-t border-dashed border-[#E3D2A5]">
        {prevLabel}: {formatSom(prev.revenue)} · {prev.orders} зак.
      </div>
    </div>
  );
}

export default function AdminStats() {
  const { token, logout } = useAdminAuth();
  const [stats, setStats] = useState<ApiStats | null>(null);
  const [year, setYear] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setStats(await adminApi.stats(token, year));
    } catch (err) {
      if (err instanceof Error && err.message.includes('токен')) logout();
      setError(err instanceof Error ? err.message : 'Не удалось загрузить статистику');
    }
  }, [token, logout, year]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-[#B0503D] text-sm">{error}</p>;
  if (!stats) return <p className="text-[#7A6A52] text-sm">Загрузка…</p>;

  const now = new Date();
  const monthName = (offset: number) =>
    new Date(now.getFullYear(), now.getMonth() + offset, 1).toLocaleString('ru-RU', {
      month: 'long',
      year: 'numeric',
    });
  const maxRevenue = Math.max(1, ...stats.months.map((m) => m.revenue));
  const yearList = stats.years.map((y) => y.year);

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#2E1F16] mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>
        Статистика
      </h1>
      <p className="text-xs text-[#9A8A6C] mb-4">Отменённые заказы не учитываются. Кофейня и книги считаются вместе.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-[#FBF6EA] border border-[#E3D2A5] rounded-2xl p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#7A6A52] mb-2">Сегодня</div>
          <div className="text-2xl font-bold text-[#2E1F16]">{formatSom(stats.today.revenue)}</div>
          <div className="text-sm text-[#7A6A52]">{stats.today.orders} заказов</div>
        </div>
        <CompareCard
          title="Месяц к месяцу"
          curLabel={monthName(0)}
          prevLabel={monthName(-1)}
          cur={stats.thisMonth}
          prev={stats.prevMonth}
        />
        <CompareCard
          title="Год к году"
          curLabel={String(stats.thisYear.year)}
          prevLabel={String(stats.prevYear.year)}
          cur={stats.thisYear}
          prev={stats.prevYear}
        />
      </div>

      <div className="bg-[#FBF6EA] border border-[#E3D2A5] rounded-2xl p-5 mb-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-[#2E1F16]">Выручка по месяцам</h2>
          <select
            value={stats.year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="input"
            aria-label="Год"
          >
            {yearList.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-1.5 sm:gap-3 h-48">
          {stats.months.map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1" title={`${formatSom(m.revenue)} · ${m.orders} зак.`}>
              <span className="text-[10px] text-[#7A6A52] hidden sm:block">{m.revenue > 0 ? m.revenue : ''}</span>
              <div
                className="w-full rounded-t bg-[#B8934F]"
                style={{ height: `${(m.revenue / maxRevenue) * 100}%`, minHeight: m.revenue > 0 ? 3 : 0 }}
              />
              <span className="text-[11px] text-[#7A6A52]">{MONTHS[i]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#FBF6EA] border border-[#E3D2A5] rounded-2xl p-5 overflow-x-auto">
          <h2 className="font-bold text-[#2E1F16] mb-3">По годам</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[#7A6A52]">
                <th className="py-1 font-semibold">Год</th>
                <th className="py-1 font-semibold">Заказов</th>
                <th className="py-1 font-semibold">Выручка</th>
                <th className="py-1 font-semibold">к пред.</th>
              </tr>
            </thead>
            <tbody>
              {stats.years.map((y, i) => {
                const d = i > 0 ? delta(y.revenue, stats.years[i - 1].revenue) : null;
                return (
                  <tr key={y.year} className="border-t border-[#E3D2A5] text-[#2E1F16]">
                    <td className="py-1.5">{y.year}</td>
                    <td>{y.orders}</td>
                    <td>{formatSom(y.revenue)}</td>
                    <td style={{ color: d?.up ? '#4F7A45' : '#B0503D' }}>{d?.text ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="bg-[#FBF6EA] border border-[#E3D2A5] rounded-2xl p-5">
          <h2 className="font-bold text-[#2E1F16] mb-3">Топ позиций за {stats.year}</h2>
          {stats.topItems.length === 0 ? (
            <p className="text-sm text-[#7A6A52]">Данных пока нет.</p>
          ) : (
            <ul className="text-sm text-[#2E1F16] flex flex-col gap-1.5">
              {stats.topItems.map((t) => (
                <li key={t.name} className="flex justify-between border-t border-[#E3D2A5] first:border-0 pt-1.5 first:pt-0">
                  <span>{t.name}</span>
                  <span className="text-[#7A6A52]">
                    {t.qty} шт · {formatSom(t.revenue)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
