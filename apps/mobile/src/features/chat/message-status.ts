/** Receipts are aggregate server facts, never timers, push acknowledgements or presence. */
export type MessageReceipt = {
  recipientCount: number;
  deliveredCount: number;
  readCount: number;
  version: number;
};
export type LocalMessageState = 'queued' | 'sending' | 'failed';
export type MessageStatusKind = LocalMessageState | 'sent' | 'delivered' | 'read' | 'partial-read';
export type MessageStatusIconKind = 'clock' | 'check' | 'double-check' | 'eye' | 'alert';
export type StatusMessage = {
  id: string;
  sequence: number;
  readByCount?: number;
  receipt?: MessageReceipt | null;
  deletedAt?: string | null;
};
export type DerivedMessageStatus = {
  kind: MessageStatusKind;
  icon: MessageStatusIconKind;
  label: string;
  explanation: string;
  recipientCount: number | null;
  deliveredCount: number | null;
  readCount: number | null;
  counter: string | null;
  acknowledged: boolean;
};
export type MessageStatusOptions = { group: boolean; localState?: LocalMessageState };

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function validReceipt(value: MessageReceipt | null | undefined): value is MessageReceipt {
  return !!value && isCount(value.recipientCount) && isCount(value.deliveredCount) && isCount(value.readCount)
    && isCount(value.version) && value.readCount <= value.deliveredCount && value.deliveredCount <= value.recipientCount;
}

/** The positive sequence belongs to a committed server message; a local UUID is not an ACK. */
export function hasServerMessageAck(message: StatusMessage): boolean {
  return !!message.id?.trim() && Number.isSafeInteger(message.sequence) && message.sequence > 0;
}

export function deriveMessageStatus(message: StatusMessage, options: MessageStatusOptions): DerivedMessageStatus | null {
  if (message.deletedAt) return null;
  const acknowledged = hasServerMessageAck(message);
  const empty = { recipientCount: null, deliveredCount: null, readCount: null, counter: null, acknowledged };
  // A server copy wins over a stale local transport failure after response-loss reconciliation.
  if (!acknowledged) {
    if (options.localState === 'failed') return { ...empty, kind: 'failed', icon: 'alert', label: 'Не доставлено', explanation: 'Отправка не подтверждена. Проверьте ошибку и повторите попытку.' };
    if (options.localState === 'queued') return { ...empty, kind: 'queued', icon: 'clock', label: 'Ожидает сети', explanation: 'Сообщение ожидает сети. Подтверждения сервера ещё нет.' };
    return { ...empty, kind: 'sending', icon: 'clock', label: 'Отправляется', explanation: 'Ждём подтверждение сохранения сообщения сервером.' };
  }
  const base: DerivedMessageStatus = { ...empty, kind: 'sent', icon: 'check', label: 'Отправлено', explanation: 'Сервер сохранил сообщение. Подтверждение получения ещё не пришло.' };
  if (validReceipt(message.receipt)) {
    const { recipientCount, deliveredCount, readCount } = message.receipt;
    const counts = { recipientCount, deliveredCount, readCount };
    // Zero recipients must not satisfy the mathematical all-read/all-delivered condition.
    if (recipientCount > 0 && readCount === recipientCount) return { ...base, ...counts, kind: 'read', icon: 'double-check', label: options.group ? `Прочитано всеми: ${readCount} из ${recipientCount}` : 'Прочитано', explanation: options.group ? 'Все доступные получатели подтвердили прочтение сообщения.' : 'Получатель подтвердил прочтение сообщения в открытой переписке.' };
    if (options.group && readCount > 0) return { ...base, ...counts, kind: 'partial-read', icon: 'eye', label: `Просмотрели ${readCount} из ${recipientCount} участников`, explanation: 'Прочтение подтверждено частью участников. Это не означает, что сообщение прочитали все.', counter: `${readCount}/${recipientCount}` };
    if (recipientCount > 0 && deliveredCount === recipientCount) return { ...base, ...counts, kind: 'delivered', icon: 'double-check', label: 'Доставлено', explanation: options.group ? 'Приложения всех доступных получателей подтвердили получение. Прочтение ещё не подтверждено всеми.' : 'Приложение получателя подтвердило получение. Прочтение ещё не подтверждено.' };
    return { ...base, ...counts, explanation: recipientCount === 0 ? 'Сервер сохранил сообщение. Сейчас нет других доступных получателей.' : deliveredCount > 0 ? `Получение подтвердили ${deliveredCount} из ${recipientCount} участников. Остальные подтверждения ещё не пришли.` : base.explanation };
  }
  // An explicit receipt is authoritative. Malformed data must never become an invented read.
  if (message.receipt !== undefined && message.receipt !== null) return { ...base, explanation: 'Сообщение сохранено сервером. Данные о доставке сейчас недоступны.' };
  // Earlier API versions expose real read counts, but no delivery acknowledgements or group denominator.
  const readCount = isCount(message.readByCount) ? message.readByCount : 0;
  if (!options.group && readCount > 0) return { ...base, kind: 'read', icon: 'double-check', label: 'Прочитано', explanation: 'Получатель подтвердил прочтение сообщения.', recipientCount: 1, readCount: 1 };
  if (options.group && readCount > 0) return { ...base, kind: 'partial-read', icon: 'eye', label: `Просмотрели: ${readCount}. Общее число получателей неизвестно.`, explanation: 'Есть подтверждения прочтения. Полное число получателей для этого сообщения не сохранено.', readCount, counter: String(readCount) };
  return base;
}
