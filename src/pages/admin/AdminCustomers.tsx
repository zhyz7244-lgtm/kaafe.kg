import { ScanLine, Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { adminApi, type AdminCustomerDetail, type CustomerProfile } from '../../api';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { formatDate, formatSom } from '../../lib/image';

// BarcodeDetector is available in Chrome/Edge/Android browsers; elsewhere the
// admin types the code or phone instead.
interface DetectorLike {
  detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (opts: { formats: string[] }) => DetectorLike;
const Detector = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;

export default function AdminCustomers() {
  const { token, logout } = useAdminAuth();
  const [q, setQ] = useState('');
  const [list, setList] = useState<CustomerProfile[]>([]);
  const [detail, setDetail] = useState<AdminCustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof Error && err.message.includes('токен')) logout();
      setError(err instanceof Error ? err.message : 'Ошибка');
    },
    [logout],
  );

  const search = useCallback(
    async (query: string) => {
      if (!token) return;
      setError(null);
      try {
        const rows = await adminApi.listCustomers(token, query);
        setList(rows);
        return rows;
      } catch (err) {
        fail(err);
      }
    },
    [token, fail],
  );

  useEffect(() => {
    search('');
  }, [search]);

  const open = async (id: number) => {
    if (!token) return;
    try {
      setDetail(await adminApi.getCustomer(token, id));
      setAmount('');
      setNote('');
      setError(null);
    } catch (err) {
      fail(err);
    }
  };

  const onSearch = async (e: FormEvent) => {
    e.preventDefault();
    const rows = await search(q);
    if (rows && rows.length === 1) open(rows[0].id);
  };

  const onScanned = async (code: string) => {
    setScanning(false);
    setQ(code);
    const rows = await search(code);
    if (rows && rows.length === 1) open(rows[0].id);
    else if (rows) setError('Клиент с таким кодом не найден');
  };

  const adjust = async (sign: 1 | -1) => {
    if (!token || !detail) return;
    const n = Number(amount);
    if (!Number.isInteger(n) || n <= 0) {
      setError('Введите количество бонусов — целое число больше нуля');
      return;
    }
    try {
      await adminApi.adjustBonus(token, detail.profile.id, sign * n, note);
      await open(detail.profile.id);
      search(q);
    } catch (err) {
      fail(err);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#2E1F16] mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
        Клиенты и бонусы
      </h1>
      <p className="text-sm text-[#7A6A52] mb-6">
        1% от выполненного заказа зарегистрированного клиента начисляется автоматически. Здесь можно найти клиента
        по телефону, имени или коду из QR и вручную начислить или списать бонусы.
      </p>

      <form onSubmit={onSearch} className="flex gap-2 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B8934F]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Телефон, имя или код (KAAFI-123456)"
            className="input w-full pl-9"
          />
        </div>
        <button type="submit" className="px-4 rounded-lg bg-[#2E1F16] text-white text-sm font-semibold">
          Найти
        </button>
        <button
          type="button"
          onClick={() => setScanning(true)}
          className="flex items-center gap-1.5 px-4 rounded-lg border border-[#B8934F] text-[#2E1F16] text-sm font-semibold"
        >
          <ScanLine size={16} /> Сканировать QR
        </button>
      </form>

      {error && <p className="text-[#B0503D] text-sm mb-4">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#FBF6EA] border border-[#E3D2A5] rounded-2xl overflow-hidden self-start">
          {list.length === 0 && <p className="p-5 text-sm text-[#7A6A52]">Клиентов не найдено.</p>}
          {list.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => open(c.id)}
              className="w-full text-left flex items-center justify-between gap-3 px-5 py-3 border-b border-[#E3D2A5] last:border-0 hover:bg-[#F1E4C8]"
            >
              <span>
                <span className="block font-semibold text-[#2E1F16]">{c.name}</span>
                <span className="text-xs text-[#9A8A6C]">
                  +{c.phone} · KAAFI-{c.code}
                </span>
              </span>
              <span className="font-bold text-[#B8934F]">{c.bonus_balance}</span>
            </button>
          ))}
        </div>

        {detail && (
          <div className="bg-[#FBF6EA] border border-[#B8934F] rounded-2xl p-5 self-start">
            <h2 className="text-lg font-bold text-[#2E1F16]">{detail.profile.name}</h2>
            <p className="text-sm text-[#7A6A52]">
              +{detail.profile.phone} · KAAFI-{detail.profile.code}
            </p>
            <p className="text-xs text-[#9A8A6C] mb-3">
              Зарегистрирован {formatDate(detail.profile.created_at)} · выполнено заказов: {detail.ordersDone} на{' '}
              {formatSom(detail.spent)}
            </p>
            <div className="text-xs uppercase tracking-wide text-[#7A6A52]">Баланс бонусов</div>
            <div className="text-3xl font-bold text-[#B8934F] mb-4">{detail.profile.bonus_balance}</div>

            <div className="flex flex-wrap gap-2 mb-2">
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Бонусов"
                className="input w-28"
              />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Комментарий (необязательно)"
                className="input flex-1 min-w-[140px]"
              />
            </div>
            <div className="flex gap-2 mb-5">
              <button
                type="button"
                onClick={() => adjust(1)}
                className="px-4 py-2 rounded-lg bg-[#2E1F16] text-white text-sm font-semibold hover:bg-[#B8934F]"
              >
                Начислить
              </button>
              <button
                type="button"
                onClick={() => adjust(-1)}
                className="px-4 py-2 rounded-lg border border-[#B0503D] text-[#B0503D] text-sm font-semibold"
              >
                Списать
              </button>
            </div>

            <h3 className="font-bold text-[#2E1F16] mb-2 text-sm">История</h3>
            {detail.transactions.length === 0 ? (
              <p className="text-sm text-[#7A6A52]">Операций пока нет.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {detail.transactions.map((t) => (
                  <li key={t.id} className="flex justify-between gap-3">
                    <span className="text-[#4A3A2C]">
                      {t.note}
                      <span className="block text-xs text-[#9A8A6C]">{formatDate(t.created_at)}</span>
                    </span>
                    <span className="font-bold" style={{ color: t.amount > 0 ? '#4F7A45' : '#B0503D' }}>
                      {t.amount > 0 ? '+' : ''}
                      {t.amount}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {scanning && <Scanner onResult={onScanned} onClose={() => setScanning(false)} />}
    </div>
  );
}

function Scanner({ onResult, onClose }: { onResult: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(
    Detector ? null : 'Этот браузер не умеет сканировать QR — введите код вручную (подойдёт Chrome на телефоне).',
  );

  useEffect(() => {
    if (!Detector) return;
    const detector = new Detector({ formats: ['qr_code'] });
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const loop = async () => {
      const video = videoRef.current;
      if (stopped || !video) return;
      try {
        const found = await detector.detect(video);
        if (found.length > 0) {
          onResult(found[0].rawValue);
          return;
        }
      } catch {
        // frame not ready yet
      }
      timer = setTimeout(loop, 250);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().then(loop).catch(() => {});
        }
      })
      .catch(() => setError('Нет доступа к камере. Разрешите её в браузере или введите код вручную.'));

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[#FBF6EA] rounded-2xl p-4 w-full max-w-sm">
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-[#7A6A52]" aria-label="Закрыть">
          <X size={20} />
        </button>
        <h3 className="font-bold text-[#2E1F16] mb-3">Наведите камеру на QR клиента</h3>
        {error ? (
          <p className="text-sm text-[#B0503D]">{error}</p>
        ) : (
          <video ref={videoRef} muted playsInline className="w-full rounded-lg bg-black aspect-square object-cover" />
        )}
      </div>
    </div>
  );
}
