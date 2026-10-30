/** Uzbek labels for order statuses (the API sends the enum names). */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Kutilmoqda',
  ACCEPTED: 'Qabul qilindi',
  ON_THE_WAY: 'Yo‘lda',
  ARRIVED: 'Yetib keldi',
  IN_PROGRESS: 'Safarda',
  COMPLETED: 'Bajarildi',
  CANCELLED: 'Bekor qilindi',
};

export const orderStatusLabel = (s: string) => ORDER_STATUS_LABEL[s] ?? s;
