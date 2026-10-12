import { BookOpen, Minus, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { booksApi, type ApiBook } from '../api';
import { BOOK_CATEGORIES, coverColors } from '../lib/bookCategories';
import { formatSom } from '../lib/image';
import Ornament from './Ornament';

const PAGE_SIZE = 24;

export default function BooksSection() {
  const [books, setBooks] = useState<ApiBook[]>([]);
  const [selected, setSelected] = useState<ApiBook | null>(null);
  const [doneId, setDoneId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    booksApi.list().then(setBooks).catch(() => {});
  }, []);

  useEffect(() => {
    if (doneId === null) return;
    const t = setTimeout(() => setDoneId(null), 8000);
    return () => clearTimeout(t);
  }, [doneId]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of books) map.set(b.category, (map.get(b.category) ?? 0) + 1);
    return map;
  }, [books]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books.filter(
      (b) =>
        (category === 'all' || b.category === category) &&
        (!q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)),
    );
  }, [books, query, category]);

  if (books.length === 0) return null;

  const shown = filtered.slice(0, visible);
  const chip = (active: boolean) =>
    `shrink-0 px-4 min-h-10 rounded-full text-sm font-medium border transition-colors ${
      active
        ? 'bg-[#2E1F16] text-white border-[#2E1F16]'
        : 'bg-[#FBF6EA] text-[#4A3A2C] border-[#E3D2A5] hover:bg-[#F1E4C8]'
    }`;

  return (
    <section id="books" className="py-12 max-w-5xl mx-auto">
      <div className="px-4 sm:px-10">
        <Ornament label="Книги" />
        <h2
          className="text-3xl sm:text-4xl font-bold text-[#2E1F16] text-center mb-2"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          Книги
        </h2>
        <p className="text-[#7A6A52] text-sm text-center mb-6">
          Выберите книгу и закажите онлайн — доставим по указанному адресу.
        </p>
      </div>

      {/* Search + categories stay visible while scrolling the long list */}
      <div className="sticky top-16 lg:top-0 z-20 bg-[#F1E4C8]/95 backdrop-blur px-4 sm:px-10 py-3 flex flex-col gap-3 border-b border-[#E3D2A5]/60">
        <label className="relative block">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9A8A6C]" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            placeholder="Поиск по названию"
            className="input w-full pl-10 min-h-12"
          />
        </label>
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 [scrollbar-width:none]">
          <button
            type="button"
            className={chip(category === 'all')}
            onClick={() => {
              setCategory('all');
              setVisible(PAGE_SIZE);
            }}
          >
            Все · {books.length}
          </button>
          {BOOK_CATEGORIES.filter((c) => counts.get(c.id)).map((c) => (
            <button
              key={c.id}
              type="button"
              className={chip(category === c.id)}
              onClick={() => {
                setCategory(c.id);
                setVisible(PAGE_SIZE);
              }}
            >
              {c.label} · {counts.get(c.id)}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 sm:px-10 pt-5">
        {filtered.length === 0 ? (
          <p className="text-center text-[#7A6A52] py-10">Ничего не найдено. Попробуйте другое слово.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
            {shown.map((book) => (
              <BookCard key={book.id} book={book} onOrder={() => setSelected(book)} />
            ))}
          </div>
        )}

        {filtered.length > shown.length && (
          <div className="text-center mt-8">
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="px-6 min-h-12 rounded-full border border-[#B8934F] text-[#2E1F16] font-semibold hover:bg-[#FBF6EA]"
            >
              Показать ещё ({filtered.length - shown.length})
            </button>
          </div>
        )}
      </div>

      {doneId !== null && (
        <div
          role="status"
          className="fixed bottom-4 inset-x-4 sm:left-auto sm:right-6 sm:max-w-sm z-40 bg-[#2E1F16] text-white rounded-2xl px-4 py-3 text-sm shadow-lg flex items-start gap-3"
        >
          <span className="flex-1">Заказ книги №{doneId} принят — мы свяжемся с вами по телефону.</span>
          <button type="button" onClick={() => setDoneId(null)} aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>
      )}

      {selected && (
        <BookOrderModal
          book={selected}
          onClose={() => setSelected(null)}
          onDone={(id) => {
            setSelected(null);
            setDoneId(id);
          }}
        />
      )}
    </section>
  );
}

function BookCard({ book, onOrder }: { book: ApiBook; onOrder: () => void }) {
  const [from, to] = coverColors(book.category);
  return (
    <article className="bg-[#FBF6EA] border border-[#E3D2A5] rounded-2xl overflow-hidden flex flex-col">
      <div className="relative aspect-[3/4] w-full">
        {book.photo ? (
          <img src={book.photo} alt={book.title} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          // No photo yet: a plain cover with the title, so the list still looks tidy.
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-white"
            style={{ background: `linear-gradient(160deg, ${from}, ${to})` }}
          >
            <BookOpen size={26} className="opacity-70 shrink-0" />
            <span
              className="font-semibold leading-snug text-[15px] line-clamp-5 break-words"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {book.title}
            </span>
          </div>
        )}
        {!book.in_stock && (
          <span className="absolute top-2 left-2 text-[11px] font-semibold px-2 py-1 rounded-full bg-[#B0503D] text-white">
            Нет в наличии
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <h3 className="text-sm font-semibold text-[#2E1F16] leading-snug line-clamp-2 min-h-[2.5rem]">{book.title}</h3>
        {book.author && <p className="text-xs text-[#9A8A6C] -mt-1 line-clamp-1">{book.author}</p>}
        <div className="mt-auto flex flex-col gap-2">
          <span className="font-bold text-[#2E1F16]">{formatSom(book.price)}</span>
          {book.in_stock ? (
            <button
              type="button"
              onClick={onOrder}
              className="w-full min-h-11 rounded-full bg-[#2E1F16] text-white text-sm font-semibold hover:bg-[#B8934F] active:bg-[#B8934F] transition-colors"
            >
              Заказать
            </button>
          ) : (
            <span className="min-h-11 flex items-center justify-center text-xs text-[#B0503D]">Скоро будет</span>
          )}
        </div>
      </div>
    </article>
  );
}

function BookOrderModal({
  book,
  onClose,
  onDone,
}: {
  book: ApiBook;
  onClose: () => void;
  onDone: (orderId: number) => void;
}) {
  const [form, setForm] = useState({ name: '', phone: '', country: 'Кыргызстан', city: 'Бишкек', address: '' });
  const [qty, setQty] = useState(1);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the page behind the sheet from scrolling on phones.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await booksApi.order({ bookId: book.id, qty, ...form });
      onDone(res.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить заказ');
      setSending(false);
    }
  };

  const stepBtn =
    'w-11 h-11 rounded-full border border-[#E3D2A5] bg-white flex items-center justify-center text-[#2E1F16] disabled:opacity-40';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative w-full sm:max-w-md bg-[#FBF6EA] rounded-t-3xl sm:rounded-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[92dvh] overflow-y-auto flex flex-col gap-3"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center text-[#7A6A52]"
          aria-label="Закрыть"
        >
          <X size={22} />
        </button>
        <h3 className="text-lg font-bold text-[#2E1F16] pr-10" style={{ fontFamily: "'Playfair Display', serif" }}>
          Заказ: {book.title}
        </h3>

        <input
          required
          autoComplete="name"
          placeholder="Ваше имя"
          value={form.name}
          onChange={set('name')}
          className="input min-h-12"
        />
        <input
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="Номер телефона"
          value={form.phone}
          onChange={set('phone')}
          className="input min-h-12"
        />
        <div className="grid grid-cols-2 gap-3">
          <input required placeholder="Страна" value={form.country} onChange={set('country')} className="input min-h-12" />
          <input required placeholder="Город" value={form.city} onChange={set('city')} className="input min-h-12" />
        </div>
        <input
          required
          autoComplete="street-address"
          placeholder="Адрес (улица, дом, кв.)"
          value={form.address}
          onChange={set('address')}
          className="input min-h-12"
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" className={stepBtn} disabled={qty <= 1} onClick={() => setQty(qty - 1)} aria-label="Меньше">
              <Minus size={18} />
            </button>
            <span className="w-6 text-center font-semibold text-[#2E1F16]">{qty}</span>
            <button type="button" className={stepBtn} disabled={qty >= 20} onClick={() => setQty(qty + 1)} aria-label="Больше">
              <Plus size={18} />
            </button>
          </div>
          <span className="font-bold text-lg text-[#2E1F16]">{formatSom(book.price * qty)}</span>
        </div>

        {error && <p className="text-sm text-[#B0503D]">{error}</p>}
        <button
          type="submit"
          disabled={sending}
          className="w-full min-h-12 rounded-full font-semibold text-white bg-[#2E1F16] disabled:opacity-50"
        >
          {sending ? 'Отправляем…' : 'Заказать книгу'}
        </button>
      </form>
    </div>
  );
}
