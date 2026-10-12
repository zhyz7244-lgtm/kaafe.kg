import { useEffect, useState, type FormEvent } from 'react';
import { reviewsApi, type ApiReview } from '../api';
import { formatDate } from '../lib/image';
import Ornament from './Ornament';
import PhotoInput from './PhotoInput';
import { StarsDisplay, StarsInput } from './Stars';

export default function ReviewsSection() {
  const [reviews, setReviews] = useState<ApiReview[]>([]);
  const [name, setName] = useState('');
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<{ preview: string; data: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    reviewsApi.list().then(setReviews).catch(() => {});
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      await reviewsApi.create({ name, rating, text, photoData: photo?.data });
      setSent(true);
      setName('');
      setRating(0);
      setText('');
      setPhoto(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить отзыв');
    } finally {
      setSending(false);
    }
  };

  return (
    <section id="reviews" className="px-4 sm:px-10 py-14 max-w-3xl mx-auto">
      <Ornament label="Отзывы" />
      <h2
        className="text-3xl sm:text-4xl font-bold text-[#2E1F16] text-center mb-8"
        style={{ fontFamily: "'Playfair Display', serif" }}
      >
        Отзывы
      </h2>

      {reviews.length > 0 && (
        <div className="flex flex-col gap-4 mb-10">
          {reviews.map((r) => (
            <article key={r.id} className="bg-[#FBF6EA] border border-[#E3D2A5] rounded-2xl p-4">
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="font-semibold text-[#2E1F16]">{r.name}</span>
                <StarsDisplay rating={r.rating} />
              </div>
              <span className="text-xs text-[#9A8A6C]">{formatDate(r.created_at)}</span>
              {r.text && <p className="text-sm text-[#4A3A2C] mt-2 whitespace-pre-line">{r.text}</p>}
              {r.photo && (
                <a href={r.photo} target="_blank" rel="noreferrer">
                  <img src={r.photo} alt="Фото к отзыву" loading="lazy" className="mt-3 max-h-72 rounded-xl object-cover" />
                </a>
              )}
            </article>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="ornate-frame rounded-2xl bg-[#FBF6EA] p-5 flex flex-col gap-3">
        <h3 className="font-bold text-[#2E1F16] text-center" style={{ fontFamily: "'Playfair Display', serif" }}>
          Оставить отзыв
        </h3>
        {sent && (
          <p className="text-sm text-[#4F7A45] text-center">Спасибо! Отзыв появится на сайте после проверки.</p>
        )}
        <input required placeholder="Ваше имя" value={name} onChange={(e) => setName(e.target.value)} className="input" />
        <div className="flex justify-center">
          <StarsInput value={rating} onChange={setRating} />
        </div>
        <textarea
          placeholder="Расскажите, как вам у нас (необязательно, если прикладываете фото)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={1000}
          className="input"
        />
        <PhotoInput
          value={photo?.preview ?? null}
          onChange={(preview, data) => setPhoto(preview && data ? { preview, data } : null)}
          label="Прикрепить фото"
        />
        {error && <p className="text-xs text-[#B0503D]">{error}</p>}
        <button
          type="submit"
          disabled={sending}
          className="py-3 rounded-full font-semibold text-white bg-[#2E1F16] disabled:opacity-50"
        >
          {sending ? 'Отправляем…' : 'Отправить отзыв'}
        </button>
      </form>
    </section>
  );
}
