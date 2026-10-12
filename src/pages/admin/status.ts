import type { OrderStatus } from '../../api';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'Новый',
  in_progress: 'В работе',
  done: 'Выполнен',
  cancelled: 'Отменён',
};

export const STATUS_COLOR: Record<OrderStatus, string> = {
  new: '#B8934F',
  in_progress: '#4A8DA8',
  done: '#7C9473',
  cancelled: '#B0503D',
};
