import type { CartLine, MenuCategory, OrderMode } from './types';

export interface ApiMenuItem {
  id: string;
  name: string;
  volume: string;
  price: number;
  category: MenuCategory;
  sort_order: number;
  photo: string | null;
  description: string | null;
}

export interface ApiOrderItem {
  id: number;
  order_id: number;
  item_id: string;
  name: string;
  volume: string;
  price: number;
  qty: number;
}

export type OrderStatus = 'new' | 'in_progress' | 'done' | 'cancelled';

export interface ApiOrder {
  id: number;
  created_at: string;
  mode: OrderMode;
  total: number;
  status: OrderStatus;
  table_number: string | null;
  phone: string | null;
  address: string | null;
  comment: string | null;
  items: ApiOrderItem[];
}

export interface OrderDetails {
  tableNumber: string;
  phone: string;
  address: string;
  comment: string;
}

export interface ApiBook {
  id: number;
  title: string;
  author: string;
  description: string;
  price: number;
  photo: string | null;
  in_stock: number;
  category: string;
}

export interface BookOrderInput {
  bookId: number;
  qty: number;
  name: string;
  phone: string;
  country: string;
  city: string;
  address: string;
}

export interface ApiBookOrder {
  id: number;
  created_at: string;
  title: string;
  price: number;
  qty: number;
  total: number;
  name: string;
  phone: string;
  country: string;
  city: string;
  address: string;
  status: OrderStatus;
}

export interface ApiReview {
  id: number;
  created_at: string;
  name: string;
  rating: number;
  text: string;
  photo: string | null;
  approved?: number;
}

export interface StatsBucket {
  cafeOrders: number;
  cafeRevenue: number;
  bookOrders: number;
  bookRevenue: number;
  orders: number;
  revenue: number;
}

export interface ApiStats {
  year: number;
  today: { orders: number; revenue: number };
  thisMonth: StatsBucket;
  prevMonth: StatsBucket;
  thisYear: StatsBucket & { year: number };
  prevYear: StatsBucket & { year: number };
  months: StatsBucket[];
  years: (StatsBucket & { year: number })[];
  topItems: { name: string; qty: number; revenue: number }[];
}

export interface AdminCounts {
  orders: number;
  bookOrders: number;
  reviews: number;
  lastOrderId: number;
  lastBookOrderId: number;
}

export interface MenuItemInput {
  name: string;
  volume: string;
  price: number;
  category: MenuCategory;
  description: string;
  /** null removes the current photo; undefined keeps it. */
  photo?: null;
  /** data URL of a newly picked photo. */
  photoData?: string;
}

export interface BookInput {
  title: string;
  author: string;
  description: string;
  price: number;
  in_stock: boolean;
  category: string;
  photo?: null;
  photoData?: string;
}

/** Partial update from the quick-edit list. */
export interface BookPatch {
  price?: number;
  in_stock?: boolean;
  photo?: null;
  photoData?: string;
}

export interface CustomerProfile {
  id: number;
  name: string;
  phone: string;
  code: string;
  bonus_balance: number;
  created_at: string;
}

export interface BonusTransaction {
  id: number;
  created_at: string;
  amount: number;
  note: string;
}

export interface CustomerMe {
  profile: CustomerProfile;
  transactions: BonusTransaction[];
  orders: { id: number; created_at: string; total: number; status: OrderStatus; mode: OrderMode }[];
  bonusPercent: number;
}

export interface AdminCustomerDetail {
  profile: CustomerProfile;
  transactions: BonusTransaction[];
  spent: number;
  ordersDone: number;
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error || `Ошибка запроса (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const menuApi = {
  list: () => request<ApiMenuItem[]>('/menu'),
};

export const ordersApi = {
  place: (mode: OrderMode, lines: CartLine[], details: OrderDetails, token?: string | null) =>
    request<{ id: number; total: number; bonus: number }>('/orders', {
      method: 'POST',
      token,
      body: JSON.stringify({
        mode,
        ...details,
        lines: lines.map((l) => ({ id: l.item.id, qty: l.qty })),
      }),
    }),
};

export const booksApi = {
  list: () => request<ApiBook[]>('/books'),
  order: (input: BookOrderInput) =>
    request<{ id: number; total: number }>('/book-orders', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

export const reviewsApi = {
  list: () => request<ApiReview[]>('/reviews'),
  create: (input: { name: string; rating: number; text: string; photoData?: string }) =>
    request<{ ok: true }>('/reviews', { method: 'POST', body: JSON.stringify(input) }),
};

export const customerApi = {
  register: (name: string, phone: string, password: string) =>
    request<{ token: string; profile: CustomerProfile }>('/customers/register', {
      method: 'POST',
      body: JSON.stringify({ name, phone, password }),
    }),
  login: (phone: string, password: string) =>
    request<{ token: string; profile: CustomerProfile }>('/customers/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    }),
  me: (token: string) => request<CustomerMe>('/customers/me', { token }),
};

export const authApi = {
  login: (email: string, password: string) =>
    request<{ token: string; email: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  changePassword: (email: string, currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ email, currentPassword, newPassword }),
    }),
};

export const adminApi = {
  listMenu: (token: string) => request<ApiMenuItem[]>('/admin/menu', { token }),
  createMenuItem: (token: string, item: MenuItemInput) =>
    request<ApiMenuItem>('/admin/menu', { method: 'POST', token, body: JSON.stringify(item) }),
  updateMenuItem: (token: string, id: string, item: MenuItemInput) =>
    request<ApiMenuItem>(`/admin/menu/${id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(item),
    }),
  deleteMenuItem: (token: string, id: string) =>
    request<void>(`/admin/menu/${id}`, { method: 'DELETE', token }),
  listOrders: (token: string) => request<ApiOrder[]>('/admin/orders', { token }),
  setOrderStatus: (token: string, id: number, status: OrderStatus) =>
    request<{ ok: true }>(`/admin/orders/${id}/status`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ status }),
    }),

  listBooks: (token: string) => request<ApiBook[]>('/admin/books', { token }),
  createBook: (token: string, book: BookInput) =>
    request<ApiBook>('/admin/books', { method: 'POST', token, body: JSON.stringify(book) }),
  updateBook: (token: string, id: number, book: BookInput) =>
    request<ApiBook>(`/admin/books/${id}`, { method: 'PUT', token, body: JSON.stringify(book) }),
  patchBook: (token: string, id: number, patch: BookPatch) =>
    request<ApiBook>(`/admin/books/${id}`, { method: 'PATCH', token, body: JSON.stringify(patch) }),
  deleteBook: (token: string, id: number) =>
    request<void>(`/admin/books/${id}`, { method: 'DELETE', token }),
  listBookOrders: (token: string) => request<ApiBookOrder[]>('/admin/book-orders', { token }),
  setBookOrderStatus: (token: string, id: number, status: OrderStatus) =>
    request<{ ok: true }>(`/admin/book-orders/${id}/status`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ status }),
    }),

  listReviews: (token: string) => request<ApiReview[]>('/admin/reviews', { token }),
  setReviewApproved: (token: string, id: number, approved: boolean) =>
    request<{ ok: true }>(`/admin/reviews/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ approved }),
    }),
  deleteReview: (token: string, id: number) =>
    request<void>(`/admin/reviews/${id}`, { method: 'DELETE', token }),

  listCustomers: (token: string, q = '') =>
    request<CustomerProfile[]>(`/admin/customers?q=${encodeURIComponent(q)}`, { token }),
  getCustomer: (token: string, id: number) =>
    request<AdminCustomerDetail>(`/admin/customers/${id}`, { token }),
  adjustBonus: (token: string, id: number, amount: number, note: string) =>
    request<CustomerProfile>(`/admin/customers/${id}/bonus`, {
      method: 'POST',
      token,
      body: JSON.stringify({ amount, note }),
    }),

  counts: (token: string) => request<AdminCounts>('/admin/counts', { token }),
  stats: (token: string, year?: number) =>
    request<ApiStats>(`/admin/stats${year ? `?year=${year}` : ''}`, { token }),
};

export { ApiError };
