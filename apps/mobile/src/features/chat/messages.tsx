import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Attachment, ListingReference, Message } from './types';
import { ChatIcon } from './components';
import { VoiceBubble } from './VoiceBubble';
import { newestReceipt } from './receipt-state';
import { fileSize, priceUnitLabel, threadText as t } from './thread-copy';
import { VideoNoteBubble } from './VideoNoteBubble';
import { LocationCard } from './LocationCard';

const isVideoAttachment = (file: Attachment) => file.kind === 'video' || !!file.mimeType?.startsWith('video/');

export function mergeMessages(current: Message[], incoming: Message[]) {
  const map = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) {
    const existing = map.get(message.id);
    if (existing?.deletedAt && !message.deletedAt) continue;
    const receipt = newestReceipt(existing?.receipt, message.receipt);
    const body = existing?.editedAt && (!message.editedAt || Date.parse(existing.editedAt) > Date.parse(message.editedAt)) && !message.deletedAt ? existing : message;
    map.set(message.id, existing ? { ...body, receipt, readByCount: receipt?.readCount ?? Math.max(existing.readByCount, message.readByCount) } : message);
  }
  const deletedIds = new Set([...map.values()].filter(message => message.deletedAt).map(message => message.id));
  return [...map.values()].map(message => message.deletedAt ? messageTombstone(message, message.deletedAt) : message.replyTo && deletedIds.has(message.replyTo.id) ? { ...message, replyTo: null } : message).sort((a, b) => a.sequence - b.sequence);
}
export function messageTombstone(message: Message, deletedAt: string): Message {
  return { ...message, text: '', kind: 'text', attachments: [], replyTo: null, listing: null, location: null, deletedAt, receipt: null, readByCount: 0 };
}
export function SafeMessageText({ text }: { text: string }) {
  const nodes: ReactNode[] = []; let offset = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>]+/gu)) {
    const at = match.index!; nodes.push(text.slice(offset, at));
    nodes.push(<a key={at} href={match[0]} target="_blank" rel="noopener noreferrer nofollow">{match[0]}</a>);
    offset = at + match[0].length;
  }
  nodes.push(text.slice(offset)); return <span className="chat-message-text">{nodes}</span>;
}
export function ListingCard({ listing, compact = false }: { listing: ListingReference; compact?: boolean }) {
  const active = listing.status === 'published';
  const unit = priceUnitLabel(listing.priceUnit);
  const price = listing.priceAmount !== null ? `${new Intl.NumberFormat('ru-RU').format(listing.priceAmount)} ₸${unit ? ` / ${unit}` : ''}` : t.priceAgreed;
  // Navigation is constructed from the trusted identifier, never a supplied external URL.
  return <a className={`chat-listing-card${compact ? ' compact' : ''}`} href={`#/market?view=listing&id=${encodeURIComponent(listing.id)}`} aria-label={`${t.openListing}: ${listing.title}`}>
    {listing.imageUrl ? <img src={listing.imageUrl} loading="lazy" alt="" /> : <span className="chat-listing-placeholder"><ChatIcon name="market" /></span>}
    <span><strong>{listing.title || t.listingUnavailable}</strong><b>{price}</b><small>{listing.regionName}</small>{!active && <small>{listing.status === 'archived' ? t.listingArchived : t.listingUnavailable}</small>}</span>
  </a>;
}
export function MessageBody({ message, onReply, onGallery }: { message: Message; onReply: (id: string) => void; onGallery: (images: Attachment[], index: number) => void }) {
  if (message.deletedAt) return null;
  const images = message.attachments.filter(file => file.kind !== 'video_note' && (file.kind === 'image' || isVideoAttachment(file)));
  return <>
    {message.replyTo && <button className="chat-reply-quote" onClick={() => onReply(message.replyTo!.id)}><strong>{message.replyTo.senderName}</strong><span>{message.replyTo.text || t.message}</span></button>}
    {images.length > 0 && <div className={`chat-message-images${images.length === 1 ? ' single' : ''}`}>{images.map((file, index) => <button key={file.id} aria-label={`${isVideoAttachment(file) ? 'Видео' : t.photo} ${index + 1}`} onClick={() => onGallery(images, index)}>{isVideoAttachment(file) ? <span className="chat-message-video"><video src={file.url} preload="metadata" muted playsInline /><span><ChatIcon name="play" />Видео</span></span> : <img src={file.thumbnailUrl || file.url} loading="lazy" alt={`${t.photo} ${index + 1}`} />}</button>)}</div>}
    {message.attachments.filter(file => file.kind === 'document' && !isVideoAttachment(file)).map(file => <a className="chat-document" key={file.id} href={file.url} target="_blank" rel="noopener noreferrer" download={file.name}><ChatIcon name="file" /><span><strong>{file.name}</strong><small>{fileSize(file.size)}</small></span></a>)}
    {message.attachments.filter(file => file.kind === 'video_note').map(file => <VideoNoteBubble key={file.id} file={file}/>)}
    {message.attachments.filter(file => file.kind === 'audio').map(file => <VoiceBubble key={file.id} file={file} />)}
    {message.listing && <ListingCard listing={message.listing} />}
    {message.kind === 'listing_reference' && !message.listing && <p className="chat-muted">{t.listingUnavailable}</p>}
    {message.location && <LocationCard location={message.location} />}
    {message.text && <SafeMessageText text={message.text} />}
  </>;
}
export function PhotoGallery({ images, initialIndex, onClose, onJump }: { images: Attachment[]; initialIndex: number; onClose: () => void; onJump?: () => void }) {
  const [index, setIndex] = useState(initialIndex), [failed, setFailed] = useState(false); const dialog = useRef<HTMLDialogElement>(null); const startX = useRef<number | null>(null);
  useEffect(() => { const element = dialog.current; const previous = document.activeElement as HTMLElement | null; element?.showModal(); return () => { element?.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); }; }, []);
  useEffect(() => setIndex(value => Math.max(0, Math.min(images.length - 1, value))), [images.length]);
  useEffect(() => setFailed(false), [index, images[index]?.url]);
  const previous = () => setIndex(value => Math.max(0, value - 1)); const next = () => setIndex(value => Math.min(images.length - 1, value + 1));
  const file = images[Math.min(index, images.length - 1)];
  if (!file) return null;
  return <dialog ref={dialog} className="chat-gallery" aria-label={isVideoAttachment(file) ? 'Просмотр видео' : t.photos} onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => { if ((event.target as HTMLElement).tagName === 'VIDEO') return; if (event.key === 'ArrowLeft') previous(); if (event.key === 'ArrowRight') next(); }}>
    <header><span aria-live="polite">{index + 1} / {images.length}</span><a className="chat-gallery-download" href={file.url} download={file.name} target="_blank" rel="noopener noreferrer"><ChatIcon name="download" size={18} />Скачать</a><button className="chat-icon-button" aria-label={t.close} onClick={onClose}><ChatIcon name="close" /></button></header>
    <div className="chat-gallery-image" onTouchStart={event => { startX.current = event.touches.length === 1 && (event.target as HTMLElement).tagName !== 'VIDEO' ? event.touches[0]?.clientX ?? null : null; }} onTouchEnd={event => { const end = event.changedTouches[0]?.clientX; if (startX.current !== null && end !== undefined) { if (end - startX.current > 50) previous(); if (end - startX.current < -50) next(); } startX.current = null; }}>{failed ? <div className="chat-gallery-error"><p>Не удалось загрузить файл.</p><a href={file.url} download={file.name}>Попробовать скачать</a></div> : file.kind === 'video_note' ? <VideoNoteBubble key={file.id} file={file}/> : isVideoAttachment(file) ? <video key={file.id} src={file.url} controls playsInline preload="metadata" onError={() => setFailed(true)} /> : <img key={file.id} src={file.url} alt={`${t.photo} ${index + 1}`} onError={() => setFailed(true)} />}</div>
    <footer><button className="chat-icon-button" disabled={index === 0} aria-label={t.previous} onClick={previous}><ChatIcon name="chevron-left" /></button>{onJump && <button className="chat-gallery-jump" onClick={onJump}>К сообщению</button>}<button className="chat-icon-button" disabled={index === images.length - 1} aria-label={t.next} onClick={next}><ChatIcon name="chevron-right" /></button></footer>
  </dialog>;
}
