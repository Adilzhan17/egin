export const threadText = {
  back: 'Назад к чатам', menu: 'Меню переписки', loading: 'Загружаем переписку…', older: 'Загрузить предыдущие сообщения',
  emptyTitle: 'Начните разговор', emptyDescription: 'Уточните условия, поделитесь фотографией или задайте вопрос.',
  offline: 'Нет соединения. Текст сохранён на этом устройстве.', reconnect: 'Восстанавливаем обновления…',
  message: 'Сообщение', placeholder: 'Написать сообщение…', send: 'Отправить', sending: 'Отправляется…', retry: 'Повторить отправку',
  failed: 'Не отправлено', newMessages: 'К новым сообщениям', read: 'Прочитано', sent: 'Отправлено', edited: 'изменено', deleted: 'Сообщение удалено',
  today: 'Сегодня', yesterday: 'Вчера', close: 'Закрыть', cancel: 'Отмена', save: 'Сохранить', reply: 'Ответить', replyTitle: 'Ответ на сообщение',
  edit: 'Редактировать', editTitle: 'Редактирование сообщения', remove: 'Удалить для всех', removeConfirm: 'Удалить сообщение для всех участников?',
  copy: 'Копировать текст', copied: 'Текст скопирован', unavailableOriginal: 'Исходное сообщение недоступно.',
  attach: 'Прикрепить', photo: 'Фото', photos: 'Фотографии', document: 'Документ', voice: 'Голосовое сообщение', listing: 'Объявление',
  location: 'Геолокация', locationPrompt: 'Отправить эти координаты участникам переписки?', locationConfirm: 'Прикрепить координаты',
  locationFinding: 'Определяем местоположение…', locationError: 'Не удалось определить местоположение. Проверьте разрешение в браузере.',
  locationUnsupported: 'Геолокация недоступна в этом браузере.', mapOpen: 'Открыть на карте',
  record: 'Записать голосовое сообщение', recording: 'Идёт запись', stop: 'Завершить запись', voiceLimit: 'До 3 минут',
  microphoneDenied: 'Микрофон недоступен. Разрешите доступ в настройках браузера и повторите.',
  recordingUnsupported: 'Этот браузер не поддерживает запись голоса. Используйте текст или документ.',
  photoLimit: 'Можно прикрепить до 10 фотографий по 10 МБ.', documentLimit: 'Можно прикрепить один PDF, DOCX или XLSX до 15 МБ.',
  upload: 'Загрузка', removeAttachment: 'Убрать вложение', preview: 'Предпросмотр', previous: 'Предыдущее фото', next: 'Следующее фото',
  listingSearch: 'Найти объявление', listingEmpty: 'Объявления не найдены', openListing: 'Открыть объявление', listingUnavailable: 'Объявление недоступно',
  listingArchived: 'Объявление в архиве', priceAgreed: 'По договорённости', readonly: 'Отправка сообщений недоступна. Проверьте права участника или блокировку.',
  mute: 'Отключить уведомления', unmute: 'Включить уведомления', pin: 'Закрепить чат', unpin: 'Открепить чат', groupInfo: 'Информация о группе',
  block: 'Заблокировать пользователя', unblock: 'Разблокировать пользователя', blockConfirm: 'Заблокировать собеседника? Отправка сообщений между вами будет недоступна.',
  report: 'Пожаловаться', reportReason: 'Причина жалобы', reportSent: 'Жалоба отправлена', reportPlaceholder: 'Опишите, что произошло',
  reportSpam: 'Спам', reportFraud: 'Мошенничество', reportAbuse: 'Оскорбления', reportOther: 'Другое', members: 'Участников',
  search: 'Поиск в переписке', searchPlaceholder: 'Поиск по сообщениям', searchEmpty: 'Сообщения не найдены',
  draftFailed: 'Не удалось сохранить черновик на устройстве.', file: 'Файл', copyFailed: 'Не удалось скопировать текст.',
  revoked: 'Доступ к переписке закрыт.',
};

export function threadError(error: unknown) { return error instanceof Error ? error.message : 'Не удалось выполнить действие. Повторите попытку.'; }
export function messageLabel(message: { text: string; kind: string; deletedAt?: string | null }) {
  if (message.deletedAt) return threadText.deleted;
  return message.text || ({ image: threadText.photo, document: threadText.document, audio: threadText.voice, listing_reference: threadText.listing, location: threadText.location }[message.kind] ?? threadText.message);
}
export function dayLabel(value: string) {
  const date = new Date(value); const today = new Date(); const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return threadText.today;
  if (date.toDateString() === yesterday.toDateString()) return threadText.yesterday;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}
export function fileSize(size: number) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} КБ` : `${(size / 1024 / 1024).toFixed(1)} МБ`; }
export function durationLabel(seconds: number) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
export function priceUnitLabel(unit: string) { return ({ all: '', ton: 'т', kg: 'кг', piece: 'шт.', head: 'голову', ha: 'га', hour: 'час', day: 'день', month: 'месяц', trip: 'рейс', liter: 'л', pack: 'уп.' } as Record<string, string>)[unit] ?? unit; }
