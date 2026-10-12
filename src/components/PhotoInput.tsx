import { ImagePlus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { resizeImage } from '../lib/image';

interface Props {
  /** Currently shown image: an existing URL or a freshly picked data URL. */
  value: string | null;
  onChange: (preview: string | null, dataUrl: string | null) => void;
  label?: string;
}

export default function PhotoInput({ value, onChange, label = 'Добавить фото' }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const data = await resizeImage(file);
      onChange(data, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки фото');
    }
  };

  return (
    <div className="flex items-center gap-3">
      {value ? (
        <div className="relative">
          <img src={value} alt="" className="w-20 h-20 object-cover rounded-lg border border-[#E3D2A5]" />
          <button
            type="button"
            onClick={() => onChange(null, null)}
            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[#2E1F16] text-white flex items-center justify-center"
            aria-label="Убрать фото"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-[#B8934F] text-sm text-[#7A6A52] hover:bg-[#F1E4C8]"
        >
          <ImagePlus size={16} /> {label}
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error && <span className="text-xs text-[#B0503D]">{error}</span>}
    </div>
  );
}
