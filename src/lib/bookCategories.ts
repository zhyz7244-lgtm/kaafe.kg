// Keep in sync with BOOK_CATEGORIES in server/books-seed.js.
export const BOOK_CATEGORIES = [
  { id: 'quran', label: 'Куран' },
  { id: 'islam', label: 'Ислам' },
  { id: 'fiction', label: 'Художественная' },
  { id: 'self', label: 'Саморазвитие и бизнес' },
  { id: 'kids', label: 'Детские' },
  { id: 'ref', label: 'Словари и учебные' },
] as const;

export const categoryLabel = (id: string) => BOOK_CATEGORIES.find((c) => c.id === id)?.label ?? 'Без категории';

// Cover colours for books that have no photo yet (deep tones that sit well with the gold/brown palette).
const COVER_COLORS: Record<string, [string, string]> = {
  quran: ['#2F5D50', '#1E3F36'],
  islam: ['#3B5A7A', '#27405A'],
  fiction: ['#8A4B3C', '#5E3025'],
  self: ['#B8934F', '#8A6B2F'],
  kids: ['#C4703F', '#8F4A22'],
  ref: ['#5E5A7A', '#403D58'],
};
export const coverColors = (category: string): [string, string] => COVER_COLORS[category] ?? ['#6B5A44', '#463A2B'];
