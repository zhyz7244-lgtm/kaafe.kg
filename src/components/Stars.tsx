import { Star } from 'lucide-react';

export function StarsDisplay({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`Оценка ${rating} из 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= rating ? 'text-[#B8934F]' : 'text-[#D9CBA6]'}
          fill={n <= rating ? '#B8934F' : 'none'}
        />
      ))}
    </span>
  );
}

export function StarsInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <span className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} из 5`}>
          <Star
            size={28}
            className={n <= value ? 'text-[#B8934F]' : 'text-[#D9CBA6]'}
            fill={n <= value ? '#B8934F' : 'none'}
          />
        </button>
      ))}
    </span>
  );
}
