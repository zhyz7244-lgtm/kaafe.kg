export type MenuCategory = 'hot' | 'iced' | 'drink' | 'mojito' | 'food';

export interface MenuItem {
  id: string;
  name: string;
  volume: string;
  price: number;
  category: MenuCategory;
  photo?: string | null;
  description?: string | null;
}

export interface CartLine {
  item: MenuItem;
  qty: number;
}

export type OrderMode = 'delivery' | 'dine-in' | 'takeaway';
