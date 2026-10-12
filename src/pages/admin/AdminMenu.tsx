import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { adminApi, type ApiMenuItem } from '../../api';
import PhotoInput from '../../components/PhotoInput';
import { useAdminAuth } from '../../context/AdminAuthContext';
import type { MenuCategory } from '../../types';

interface FormState {
  name: string;
  volume: string;
  price: string;
  category: MenuCategory;
  description: string;
  photo: string | null; // preview or existing URL
  photoData: string | null; // newly picked photo (data URL)
}

const CATEGORY_LABEL: Record<MenuCategory, string> = {
  hot: 'Кофе',
  iced: 'Холодный кофе',
  drink: 'Напитки',
  mojito: 'Мохито',
  food: 'Еда',
};

const EMPTY_FORM: FormState = {
  name: '',
  volume: '',
  price: '',
  category: 'hot',
  description: '',
  photo: null,
  photoData: null,
};

export default function AdminMenu() {
  const { token, logout } = useAdminAuth();
  const [items, setItems] = useState<ApiMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await adminApi.listMenu(token));
    } catch (err) {
      if (err instanceof Error && err.message.includes('токен')) logout();
      setError(err instanceof Error ? err.message : 'Не удалось загрузить меню');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const startAdd = () => {
    setEditingId('new');
    setForm(EMPTY_FORM);
  };

  const startEdit = (item: ApiMenuItem) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      volume: item.volume,
      price: String(item.price),
      category: item.category,
      description: item.description ?? '',
      photo: item.photo,
      photoData: null,
    });
  };

  const save = async () => {
    if (!token || !editingId) return;
    const price = Number(form.price);
    if (!form.name || !Number.isInteger(price) || price <= 0) {
      setError('Заполните название и цену (целое число)');
      return;
    }
    const payload = {
      name: form.name,
      volume: form.volume,
      price,
      category: form.category,
      description: form.description,
      ...(form.photoData ? { photoData: form.photoData } : form.photo === null ? { photo: null } : {}),
    };
    setSaving(true);
    setError(null);
    try {
      if (editingId === 'new') {
        const created = await adminApi.createMenuItem(token, payload);
        setItems((prev) => [...prev, created]);
      } else {
        const updated = await adminApi.updateMenuItem(token, editingId, payload);
        setItems((prev) => prev.map((i) => (i.id === editingId ? updated : i)));
      }
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!token) return;
    if (!window.confirm('Удалить эту позицию из меню?')) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await adminApi.deleteMenuItem(token, id);
    } catch {
      load();
    }
  };

  const formUi = (
    <div className="bg-[#FBF6EA] border border-[#B8934F] rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Field label="Название">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
        </Field>
        <Field label="Объём / порция">
          <input
            value={form.volume}
            onChange={(e) => setForm({ ...form, volume: e.target.value })}
            placeholder="напр. 300 мл"
            className="input"
          />
        </Field>
        <Field label="Цена, с">
          <input
            type="number"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            className="input w-24"
          />
        </Field>
        <Field label="Раздел">
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as MenuCategory })}
            className="input"
          >
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Описание (необязательно)">
        <input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="input"
        />
      </Field>
      <PhotoInput
        value={form.photo}
        onChange={(preview, data) => setForm({ ...form, photo: preview, photoData: data })}
      />
      <div className="flex gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2.5 rounded-lg bg-[#2E1F16] text-white text-sm font-semibold hover:bg-[#B8934F] disabled:opacity-50"
        >
          Сохранить
        </button>
        <button type="button" onClick={() => setEditingId(null)} className="px-3 py-2.5 text-sm text-[#7A6A52]">
          Отмена
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#2E1F16]" style={{ fontFamily: "'Playfair Display', serif" }}>
          Меню, напитки и еда
        </h1>
        <button
          type="button"
          onClick={startAdd}
          className="flex items-center gap-1.5 text-sm font-semibold text-white bg-[#2E1F16] hover:bg-[#B8934F] px-4 py-2 rounded-full transition-colors"
        >
          <Plus size={16} /> Добавить позицию
        </button>
      </div>

      {editingId === 'new' && <div className="mb-6">{formUi}</div>}

      {loading ? (
        <p className="text-[#7A6A52] text-sm">Загрузка…</p>
      ) : error ? (
        <p className="text-[#B0503D] text-sm mb-4">{error}</p>
      ) : null}

      {!loading && (
        <div className="bg-[#FBF6EA] border border-[#E3D2A5] rounded-2xl overflow-hidden">
          {items.map((item) =>
            editingId === item.id ? (
              <div key={item.id} className="p-3">
                {formUi}
              </div>
            ) : (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-[#E3D2A5] last:border-0"
              >
                {item.photo ? (
                  <img src={item.photo} alt="" className="w-10 h-10 rounded-md object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-md bg-[#F1E4C8]" />
                )}
                <span
                  className="font-semibold text-[#2E1F16] flex-1 min-w-[120px]"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  {item.name}
                </span>
                <span className="text-sm text-[#9A8A6C] w-20">{item.volume}</span>
                <span className="text-xs uppercase tracking-wide text-[#B8934F] w-28">
                  {CATEGORY_LABEL[item.category] ?? item.category}
                </span>
                <span className="font-bold text-[#2E1F16] w-16 text-right">{item.price} с</span>
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  className="w-11 h-11 -m-2 flex items-center justify-center text-[#4A3A2C] hover:text-[#B8934F]"
                  aria-label={`Редактировать ${item.name}`}
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  className="w-11 h-11 -m-2 flex items-center justify-center text-[#B3A38D] hover:text-[#B0503D]"
                  aria-label={`Удалить ${item.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[#7A6A52]">
      {label}
      {children}
    </label>
  );
}
