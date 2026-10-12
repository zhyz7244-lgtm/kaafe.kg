import { Camera, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi, type ApiBook, type ApiBookOrder, type BookPatch, type OrderStatus } from '../../api';
import PhotoInput from '../../components/PhotoInput';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { BOOK_CATEGORIES, categoryLabel } from '../../lib/bookCategories';
import { formatDate, formatSom, resizeImage } from '../../lib/image';
import { STATUS_COLOR, STATUS_LABEL } from './status';

const PAGE_SIZE = 30;

interface FormState {
  title: string;
  author: string;
  category: string;
  description: string;
  price: string;
  in_stock: boolean;
  photo: string | null;
  photoData: string | null;
}

const EMPTY: FormState = {
  title: '',
  author: '',
  category: 'islam',
  description: '',
  price: '',
  in_stock: true,
  photo: null,
  photoData: null,
};

const FIELD = 'flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[#7A6A52]';

export default function AdminBooks() {
  const { token, logout } = useAdminAuth();
  const [books, setBooks] = useState<ApiBook[]>([]);
  const [orders, setOrders] = useState<ApiBookOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'catalog' | 'orders'>('catalog');
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [noPhotoOnly, setNoPhotoOnly] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [b, o] = await Promise.all([adminApi.listBooks(token), adminApi.listBookOrders(token)]);
      setBooks(b);
      setOrders(o);
    } catch (err) {
      if (err instanceof Error && err.message.includes('токен')) logout();
      setError(err instanceof Error ? err.message : 'Не удалось загрузить данные');
    }
  }, [token, logout]);

  useEffect(() => {
    load();
  }, [load]);

  const withoutPhoto = useMemo(() => books.filter((b) => !b.photo).length, [books]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books.filter(
      (b) =>
        (category === 'all' || (category === 'none' ? !b.category : b.category === category)) &&
        (!noPhotoOnly || !b.photo) &&
        (!q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)),
    );
  }, [books, query, category, noPhotoOnly]);

  const startEdit = (b: ApiBook) => {
    setError(null);
    setEditingId(b.id);
    setForm({
      title: b.title,
      author: b.author,
      category: b.category || 'islam',
      description: b.description,
      price: String(b.price),
      in_stock: !!b.in_stock,
      photo: b.photo,
      photoData: null,
    });
  };

  const save = async () => {
    if (!token || editingId === null) return;
    const price = Number(form.price);
    if (!form.title.trim() || !Number.isInteger(price) || price <= 0) {
      setError('Заполните название и цену (целое число)');
      return;
    }
    const payload = {
      title: form.title,
      author: form.author,
      category: form.category,
      description: form.description,
      price,
      in_stock: form.in_stock,
      ...(form.photoData ? { photoData: form.photoData } : form.photo === null ? { photo: null } : {}),
    };
    setSaving(true);
    setError(null);
    try {
      if (editingId === 'new') {
        const created = await adminApi.createBook(token, payload);
        setBooks((prev) => [...prev, created]);
      } else {
        const updated = await adminApi.updateBook(token, editingId, payload);
        setBooks((prev) => prev.map((b) => (b.id === editingId ? updated : b)));
      }
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  // Quick edits straight from the list (price, stock, photo): saved immediately.
  const patch = async (id: number, change: BookPatch) => {
    if (!token) return;
    setError(null);
    try {
      const updated = await adminApi.patchBook(token, id, change);
      setBooks((prev) => prev.map((b) => (b.id === id ? updated : b)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
      load();
    }
  };

  const pickPhoto = async (id: number, file: File | undefined) => {
    if (!file) return;
    try {
      await patch(id, { photoData: await resizeImage(file) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки фото');
    }
  };

  const remove = async (b: ApiBook) => {
    if (!token || !window.confirm(`Удалить «${b.title}»?`)) return;
    setBooks((prev) => prev.filter((x) => x.id !== b.id));
    try {
      await adminApi.deleteBook(token, b.id);
    } catch {
      load();
    }
  };

  const setStatus = async (id: number, status: OrderStatus) => {
    if (!token) return;
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    try {
      await adminApi.setBookOrderStatus(token, id, status);
    } catch {
      load();
    }
  };

  const newOrders = orders.filter((o) => o.status === 'new').length;
  const tabBtn = (active: boolean) =>
    `flex-1 min-h-11 rounded-full text-sm font-semibold transition-colors ${
      active ? 'bg-[#2E1F16] text-white' : 'text-[#4A3A2C]'
    }`;

  const shown = filtered.slice(0, visible);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-[#2E1F16]" style={{ fontFamily: "'Playfair Display', serif" }}>
          Книги
        </h1>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setEditingId('new');
            setForm(EMPTY);
          }}
          className="flex items-center gap-1.5 text-sm font-semibold text-white bg-[#2E1F16] hover:bg-[#B8934F] px-4 min-h-11 rounded-full transition-colors"
        >
          <Plus size={16} /> Добавить
        </button>
      </div>

      <div className="flex gap-1 p-1 mb-4 bg-[#FBF6EA] border border-[#E3D2A5] rounded-full">
        <button type="button" className={tabBtn(tab === 'catalog')} onClick={() => setTab('catalog')}>
          Каталог · {books.length}
        </button>
        <button type="button" className={tabBtn(tab === 'orders')} onClick={() => setTab('orders')}>
          Заказы{newOrders ? ` · ${newOrders} новых` : ` · ${orders.length}`}
        </button>
      </div>

      {error && editingId === null && <p className="text-[#B0503D] text-sm mb-4">{error}</p>}

      {editingId !== null && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditingId(null)} />
          <div className="relative w-full sm:max-w-lg bg-[#FBF6EA] rounded-t-3xl sm:rounded-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[92dvh] overflow-y-auto flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center text-[#7A6A52]"
              aria-label="Закрыть"
            >
              <X size={22} />
            </button>
            <h3 className="text-lg font-bold text-[#2E1F16] pr-10" style={{ fontFamily: "'Playfair Display', serif" }}>
              {editingId === 'new' ? 'Новая книга' : 'Редактировать книгу'}
            </h3>
            <label className={FIELD}>
              Название
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="input min-h-12"
              />
            </label>
            <div className="grid grid-cols-1 min-[440px]:grid-cols-2 gap-3">
              <label className={FIELD}>
                Цена, с
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className="input min-h-12"
                />
              </label>
              <label className={FIELD}>
                Категория
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="input min-h-12"
                >
                  {BOOK_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className={FIELD}>
              Автор (необязательно)
              <input
                value={form.author}
                onChange={(e) => setForm({ ...form, author: e.target.value })}
                className="input min-h-12"
              />
            </label>
            <label className={FIELD}>
              Описание (необязательно)
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input normal-case font-normal tracking-normal"
              />
            </label>
            <PhotoInput
              value={form.photo}
              label="Фото книги"
              onChange={(preview, data) => setForm({ ...form, photo: preview, photoData: data })}
            />
            <label className="flex items-center gap-3 text-sm text-[#4A3A2C] min-h-11">
              <input
                type="checkbox"
                className="w-5 h-5"
                checked={form.in_stock}
                onChange={(e) => setForm({ ...form, in_stock: e.target.checked })}
              />
              В наличии
            </label>
            {error && <p className="text-sm text-[#B0503D]">{error}</p>}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="w-full min-h-12 rounded-full bg-[#2E1F16] text-white font-semibold hover:bg-[#B8934F] disabled:opacity-50"
            >
              {saving ? 'Сохраняем…' : 'Сохранить'}
            </button>
            {editingId !== 'new' && (
              <button
                type="button"
                onClick={() => {
                  const book = books.find((b) => b.id === editingId);
                  if (book) {
                    setEditingId(null);
                    remove(book);
                  }
                }}
                className="flex items-center justify-center gap-2 min-h-11 text-sm text-[#B0503D]"
              >
                <Trash2 size={16} /> Удалить книгу
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'catalog' ? (
        <>
          <div className="flex flex-col gap-3 mb-4">
            <label className="relative block">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9A8A6C]" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setVisible(PAGE_SIZE);
                }}
                placeholder="Найти книгу"
                className="input w-full pl-10 min-h-12"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setVisible(PAGE_SIZE);
                }}
                className="input min-h-12"
              >
                <option value="all">Все категории</option>
                {BOOK_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
                <option value="none">Без категории</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  setNoPhotoOnly((v) => !v);
                  setVisible(PAGE_SIZE);
                }}
                className={`min-h-12 rounded-lg border text-sm font-medium ${
                  noPhotoOnly ? 'bg-[#2E1F16] text-white border-[#2E1F16]' : 'bg-white text-[#4A3A2C] border-[#E3D2A5]'
                }`}
              >
                Без фото · {withoutPhoto}
              </button>
            </div>
            <p className="text-xs text-[#9A8A6C]">
              Найдено {filtered.length} из {books.length}. Нажмите на квадрат слева, чтобы добавить фото.
            </p>
          </div>

          <div className="bg-[#FBF6EA] border border-[#E3D2A5] rounded-2xl overflow-hidden mb-6">
            {filtered.length === 0 && <p className="p-5 text-sm text-[#7A6A52]">Ничего не найдено.</p>}
            {shown.map((b) => (
              <BookRow
                // Re-mount when the saved price changes so the input follows it.
                key={`${b.id}:${b.price}`}
                book={b}
                onPatch={(change) => patch(b.id, change)}
                onPhoto={(file) => pickPhoto(b.id, file)}
                onEdit={() => startEdit(b)}
              />
            ))}
          </div>
          {filtered.length > shown.length && (
            <div className="text-center mb-6">
              <button
                type="button"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                className="px-6 min-h-12 rounded-full border border-[#B8934F] text-[#2E1F16] font-semibold"
              >
                Показать ещё ({filtered.length - shown.length})
              </button>
            </div>
          )}
        </>
      ) : (
        <BookOrders orders={orders} onStatus={setStatus} />
      )}
    </div>
  );
}

function BookRow({
  book,
  onPatch,
  onPhoto,
  onEdit,
}: {
  book: ApiBook;
  onPatch: (change: BookPatch) => void;
  onPhoto: (file: File | undefined) => void;
  onEdit: () => void;
}) {
  const [price, setPrice] = useState(String(book.price));

  const commitPrice = () => {
    const n = Number(price);
    if (!Number.isInteger(n) || n <= 0) return setPrice(String(book.price));
    if (n !== book.price) onPatch({ price: n });
  };

  return (
    <div className="flex gap-3 px-3 sm:px-5 py-3 border-b border-[#E3D2A5] last:border-0">
      <label className="relative shrink-0 w-14 h-[72px] rounded-lg overflow-hidden bg-[#F1E4C8] border border-dashed border-[#B8934F] cursor-pointer flex items-center justify-center">
        {book.photo ? (
          <img src={book.photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <Camera size={20} className="text-[#B8934F]" />
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            onPhoto(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div>
          <div className="font-semibold text-[#2E1F16] leading-snug break-words">{book.title}</div>
          <div className="text-xs text-[#9A8A6C]">{categoryLabel(book.category)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-sm text-[#4A3A2C]">
            <input
              type="number"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onBlur={commitPrice}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              aria-label="Цена"
              className="input w-24 min-h-11"
            />
            с
          </label>
          <button
            type="button"
            onClick={() => onPatch({ in_stock: !book.in_stock })}
            className={`min-h-11 px-3 rounded-full text-xs font-semibold border ${
              book.in_stock
                ? 'bg-[#E8F0E4] text-[#4F7A45] border-[#BFD3B7]'
                : 'bg-[#F6E3DE] text-[#B0503D] border-[#E5BFB6]'
            }`}
          >
            {book.in_stock ? 'В наличии' : 'Нет в наличии'}
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onEdit}
            className="w-11 h-11 flex items-center justify-center text-[#4A3A2C] hover:text-[#B8934F]"
            aria-label="Редактировать"
          >
            <Pencil size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function BookOrders({
  orders,
  onStatus,
}: {
  orders: ApiBookOrder[];
  onStatus: (id: number, status: OrderStatus) => void;
}) {
  if (orders.length === 0) return <p className="text-sm text-[#7A6A52]">Заказов книг пока нет.</p>;
  return (
    <div className="flex flex-col gap-4">
      {orders.map((o) => (
        <div key={o.id} className="bg-[#FBF6EA] border border-[#E3D2A5] rounded-2xl p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <div>
              <span className="font-bold text-[#2E1F16]">Заказ №{o.id}</span>
              <span className="text-sm text-[#7A6A52] ml-3">{formatDate(o.created_at)}</span>
            </div>
            <select
              value={o.status}
              onChange={(e) => onStatus(o.id, e.target.value as OrderStatus)}
              className="text-sm font-semibold px-3 min-h-10 rounded-full border-0 text-white"
              style={{ backgroundColor: STATUS_COLOR[o.status] }}
            >
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="text-sm text-[#4A3A2C]">
            {o.title} × {o.qty} — <b>{formatSom(o.total)}</b>
          </div>
          <div className="text-sm text-[#7A6A52] mt-2">
            {o.name} ·{' '}
            <a href={`tel:${o.phone}`} className="underline">
              {o.phone}
            </a>
            <br />
            {o.country}, {o.city}, {o.address}
          </div>
        </div>
      ))}
    </div>
  );
}
