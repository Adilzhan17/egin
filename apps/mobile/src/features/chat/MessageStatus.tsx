import { useState } from 'react';
import { ChatSheet } from './components';
import { chatLabel } from './locale';
import type { Message } from './types';
import { deriveMessageStatus, type DerivedMessageStatus, type LocalMessageState, type MessageReceipt, type MessageStatusIconKind } from './message-status';
import './status.css';

type StatusProps = {
  message: Message & { receipt?: MessageReceipt | null };
  group: boolean;
  localState?: LocalMessageState;
  error?: string;
  progress?: number;
  onRetry?: () => void;
  onDiscard?: () => void;
};

export function MessageStatusIcon({ icon }: { icon: MessageStatusIconKind }) {
  return <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    {icon === 'clock' ? <><circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/></> :
      icon === 'alert' ? <><circle cx="10" cy="10" r="7"/><path d="M10 5.8v4.7M10 14h.01"/></> :
        icon === 'eye' ? <><path d="M1.5 10s3-5.5 8.5-5.5 8.5 5.5 8.5 5.5-3 5.5-8.5 5.5S1.5 10 1.5 10Z"/><circle cx="10" cy="10" r="2.3"/></> :
          icon === 'double-check' ? <><path d="m1.5 10 4 4 8-9M8 11l3 3 7.5-9"/></> : <path d="m3 10 4.5 4.5L17 5"/>}
  </svg>;
}

function StatusMark({ status }: { status: DerivedMessageStatus }) {
  return <><MessageStatusIcon icon={status.icon}/>{status.counter && <span className="chat-status-counter">{status.counter}</span>}</>;
}

/** Non-interactive form for the existing clickable conversation row; never nests a button. */
export function MessageStatusSummary({ message, group, localState }: Pick<StatusProps, 'message' | 'group' | 'localState'>) {
  const status = deriveMessageStatus(message, { group, localState });
  return status ? <span className={`chat-message-status-summary is-${status.kind}`} data-message-status={status.kind} role="img" aria-label={chatLabel(status.label)}><StatusMark status={status}/></span> : null;
}

export default function MessageStatus({ message, group, localState, error, progress, onRetry, onDiscard }: StatusProps) {
  const [details, setDetails] = useState(false);
  const status = deriveMessageStatus(message, { group, localState });
  if (!status) return null;
  const uploading = status.kind === 'sending' && Number.isFinite(progress) && progress! >= 0 && progress! <= 100;
  const retry = () => { setDetails(false); onRetry?.(); };
  const recipientCount = status.recipientCount;
  return <>
    <span className={`chat-message-status-wrap is-${status.kind}`}>
      <button type="button" className={`chat-message-status is-${status.kind}`} data-message-status={status.kind} aria-label={chatLabel(status.label)} aria-haspopup="dialog" title={chatLabel(status.label)} onClick={() => setDetails(true)}>
        <StatusMark status={status}/>
      </button>
      {status.kind === 'failed' && <span className="chat-status-failure">{chatLabel('Не доставлено')}{onRetry && <button type="button" className="chat-status-retry" onClick={retry}>{chatLabel('Повторить')}</button>}</span>}
      {uploading && <span className="chat-status-upload" aria-label={`${chatLabel('Загрузка')}: ${Math.round(progress!)}%`}>{Math.round(progress!)}%</span>}
    </span>
    {details && <ChatSheet title={chatLabel('Статус сообщения')} onClose={() => setDetails(false)}>
      <section className="chat-status-details" aria-label={chatLabel('Подтверждения сообщения')}>
        <div className={`chat-status-details-heading is-${status.kind}`}><span className="chat-status-details-icon"><MessageStatusIcon icon={status.icon}/></span><h3>{chatLabel(status.label)}</h3></div>
        <p>{chatLabel(status.explanation)}</p>
        {status.acknowledged && <dl className="chat-status-facts">
          <div><dt>{chatLabel('Получено сервером')}</dt><dd>{chatLabel('Да')}</dd></div>
          <div><dt>{chatLabel('Доставлено')}</dt><dd>{status.deliveredCount === null ? chatLabel('Нет данных') : recipientCount === 0 ? chatLabel('Нет получателей') : `${status.deliveredCount} ${chatLabel('из')} ${recipientCount}`}</dd></div>
          <div><dt>{group ? chatLabel('Просмотрели участники') : chatLabel('Прочитано')}</dt><dd>{status.readCount === null ? chatLabel('Нет подтверждения') : recipientCount === 0 ? chatLabel('Нет получателей') : recipientCount === null ? status.readCount : `${status.readCount} ${chatLabel('из')} ${recipientCount}`}</dd></div>
        </dl>}
        {uploading && <div className="chat-status-progress"><label htmlFor={`upload-${message.clientId}`}>{chatLabel('Загрузка вложений')} · {Math.round(progress!)}%</label><progress id={`upload-${message.clientId}`} max="100" value={progress}/></div>}
        {group && recipientCount !== null && recipientCount > 0 && <p className="chat-status-policy">{chatLabel('В счётчике — доступные получатели без автора. Вышедшие и удалённые участники исключаются.')}</p>}
        {status.kind === 'failed' && error && <p className="chat-status-error" role="alert">{error}</p>}
        {status.kind === 'failed' && onRetry && <button type="button" className="chat-button" onClick={retry}>{chatLabel('Повторить отправку')}</button>}
        {['queued', 'failed'].includes(status.kind) && onDiscard && <button type="button" className="chat-text-button" onClick={() => { if (window.confirm('Убрать сообщение и вложения из очереди на этом устройстве?')) { setDetails(false); onDiscard(); } }}>{chatLabel('Убрать из очереди')}</button>}
      </section>
    </ChatSheet>}
  </>;
}
