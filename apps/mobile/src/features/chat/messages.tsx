import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Attachment, ListingReference, Message } from './types';
import { ChatIcon } from './components';
import { durationLabel, fileSize, priceUnitLabel, threadText as t } from './thread-copy';

export function mergeMessages(current: Message[], incoming: Message[]) {
  const map = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) {
    const existing = map.get(message.id);
    if (existing?.deletedAt && !message.deletedAt) continue;
    if (existing?.editedAt && (!message.editedAt || Date.parse(existing.editedAt) > Date.parse(message.editedAt)) && !message.deletedAt) continue;
    map.set(message.id, existing ? { ...message, readByCount: Math.max(existing.readByCount, message.readByCount) } : message);
  }
  return [...map.values()].sort((a, b) => a.sequence - b.sequence);
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
function AudioMessage({ file }: { file: Attachment }) {
  return <div className="chat-audio"><span><ChatIcon name="mic" size={17} />{t.voice}{file.duration ? ` · ${durationLabel(file.duration)}` : ''}</span><audio controls preload="metadata" src={file.url} aria-label={t.voice} /></div>;
}
export function MessageBody({ message, onReply, onGallery }: { message: Message; onReply: (id: string) => void; onGallery: (images: Attachment[], index: number) => void }) {
  if (message.deletedAt) return <i className="chat-deleted">{t.deleted}</i>;
  const images = message.attachments.filter(file => file.kind === 'image');
  return <>
    {message.replyTo && <button className="chat-reply-quote" onClick={() => onReply(message.replyTo!.id)}><strong>{message.replyTo.senderName}</strong><span>{message.replyTo.text || t.message}</span></button>}
    {images.length > 0 && <div className={`chat-message-images${images.length === 1 ? ' single' : ''}`}>{images.map((file, index) => <button key={file.id} aria-label={`${t.photo} ${index + 1}`} onClick={() => onGallery(images, index)}><img src={file.thumbnailUrl || file.url} loading="lazy" alt={`${t.photo} ${index + 1}`} /></button>)}</div>}
    {message.attachments.filter(file => file.kind === 'document').map(file => <a className="chat-document" key={file.id} href={file.url} target="_blank" rel="noopener noreferrer" download={file.name}><ChatIcon name="file" /><span><strong>{file.name}</strong><small>{fileSize(file.size)}</small></span></a>)}
    {message.attachments.filter(file => file.kind === 'audio').map(file => <AudioMessage key={file.id} file={file} />)}
    {message.listing && <ListingCard listing={message.listing} />}
    {message.kind === 'listing_reference' && !message.listing && <p className="chat-muted">{t.listingUnavailable}</p>}
    {message.location && <a className="chat-location-card" href={`https://www.openstreetmap.org/?mlat=${message.location.latitude}&mlon=${message.location.longitude}#map=16/${message.location.latitude}/${message.location.longitude}`} target="_blank" rel="noopener noreferrer"><ChatIcon name="location" /><span><strong>{message.location.label || t.location}</strong><small>{message.location.latitude.toFixed(5)}, {message.location.longitude.toFixed(5)}</small><small>{t.mapOpen} ↗</small></span></a>}
    {message.text && <SafeMessageText text={message.text} />}
  </>;
}
export function PhotoGallery({ images, initialIndex, onClose }: { images: Attachment[]; initialIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(initialIndex); const dialog = useRef<HTMLDialogElement>(null); const startX = useRef<number | null>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const previous = () => setIndex(value => Math.max(0, value - 1)); const next = () => setIndex(value => Math.min(images.length - 1, value + 1));
  return <dialog ref={dialog} className="chat-gallery" aria-label={t.photos} onCancel={onClose} onKeyDown={event => { if (event.key === 'ArrowLeft') previous(); if (event.key === 'ArrowRight') next(); }}>
    <header><span>{index + 1} / {images.length}</span><button className="chat-icon-button" aria-label={t.close} onClick={onClose}><ChatIcon name="close" /></button></header>
    <div className="chat-gallery-image" onTouchStart={event => { startX.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={event => { const end = event.changedTouches[0]?.clientX; if (startX.current !== null && end !== undefined) { if (end - startX.current > 50) previous(); if (end - startX.current < -50) next(); } startX.current = null; }}><img src={images[index].url} alt={`${t.photo} ${index + 1}`} /></div>
    <footer><button className="chat-icon-button" disabled={index === 0} aria-label={t.previous} onClick={previous}><ChatIcon name="chevron-left" /></button><button className="chat-icon-button" disabled={index === images.length - 1} aria-label={t.next} onClick={next}><ChatIcon name="chevron-right" /></button></footer>
  </dialog>;
}
