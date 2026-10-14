import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Attachment, ListingReference, Message } from './types';
import { ChatIcon } from './components';
import { VoiceBubble, pauseChatVoice } from './VoiceBubble';
import { newestReceipt } from './receipt-state';
import { durationLabel, fileSize, priceUnitLabel, threadText as t } from './thread-copy';
import { VideoNoteBubble, pauseChatVideoNote } from './VideoNoteBubble';
import { LocationCard } from './LocationCard';
import { animateChat, motion, useMotionPhase } from './motion';

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
    {images.length > 0 && <div className={`chat-message-images${images.length === 1 ? ' single' : ''}`}>{images.map((file, index) => <button key={file.id} aria-label={`${isVideoAttachment(file) ? 'Видео' : t.photo} ${index + 1}`} onClick={() => onGallery(images, index)}>{isVideoAttachment(file) ? <span className="chat-message-video"><video src={file.url} poster={file.thumbnailUrl} preload="metadata" muted playsInline /><span><ChatIcon name="play" />Видео{file.duration ? ` · ${durationLabel(file.duration)}` : ''}</span></span> : <img src={file.thumbnailUrl || file.url} loading="lazy" alt={`${t.photo} ${index + 1}`} />}</button>)}</div>}
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
  const phase = useMotionPhase();
  const [index, setIndex] = useState(initialIndex), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null), imageArea = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null), direction = useRef(0);
  useLayoutEffect(() => {
    const element = dialog.current; const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => { element?.querySelectorAll('video').forEach(video => video.pause()); element?.close(); if (previous?.isConnected && !document.querySelector('dialog[open]')) previous.focus({ preventScroll: true }); };
  }, []);
  useLayoutEffect(() => {
    const exiting = phase === 'exit';
    if (exiting) dialog.current?.querySelectorAll('video').forEach(video => video.pause());
    const animation = animateChat(dialog.current, exiting ? [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.985)' }] : [{ opacity: 0, transform: 'scale(.985)' }, { opacity: 1, transform: 'scale(1)' }], { duration: motion.normal, fill: exiting ? 'forwards' : 'none' });
    return () => animation?.cancel();
  }, [phase]);
  useEffect(() => setIndex(value => Math.max(0, Math.min(images.length - 1, value))), [images.length]);
  useEffect(() => { setFailed(false); setAttempt(0); }, [index, images[index]?.url]);
  const file = images[Math.min(index, images.length - 1)];
  useLayoutEffect(() => {
    const animation = animateChat(imageArea.current, [{ opacity: .35, transform: `translate3d(${direction.current * 20}px,0,0)` }, { opacity: 1, transform: 'translate3d(0,0,0)' }], { duration: motion.fast });
    return () => animation?.cancel();
  }, [file?.id]);
  const previous = () => { direction.current = -1; setIndex(value => Math.max(0, value - 1)); };
  const next = () => { direction.current = 1; setIndex(value => Math.min(images.length - 1, value + 1)); };
  if (!file) return null;
  return <dialog ref={dialog} className="chat-gallery" data-motion-phase={phase} inert={phase === 'exit'} aria-label={isVideoAttachment(file) ? 'Просмотр видео' : t.photos} onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => { if ((event.target as HTMLElement).tagName === 'VIDEO') return; if (event.key === 'ArrowLeft') { event.preventDefault(); previous(); } if (event.key === 'ArrowRight') { event.preventDefault(); next(); } }}>
    <header><span aria-live="polite">{index + 1} / {images.length}</span><a className="chat-gallery-download" href={file.url} download={file.name} target="_blank" rel="noopener noreferrer"><ChatIcon name="download" size={18} />Скачать</a><button className="chat-icon-button" aria-label={t.close} onClick={onClose}><ChatIcon name="close" /></button></header>
    <div ref={imageArea} className="chat-gallery-image" onTouchStart={event => { const touch = event.touches[0]; swipe.current = event.touches.length === 1 && (event.target as HTMLElement).tagName !== 'VIDEO' && touch ? { x: touch.clientX, y: touch.clientY } : null; }} onTouchMove={event => { if (event.touches.length !== 1) swipe.current = null; }} onTouchCancel={() => { swipe.current = null; }} onTouchEnd={event => {
      const start = swipe.current, end = event.changedTouches[0]; swipe.current = null;
      if (!start || !end) return;
      const dx = end.clientX - start.x, dy = end.clientY - start.y;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      if (dx > 0) previous(); else next();
    }}>{failed ? <div className="chat-gallery-error" role="status"><p>Не удалось загрузить файл.</p><button className="chat-gallery-retry" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}><ChatIcon name="retry" size={18} />Повторить загрузку</button><a href={file.url} download={file.name}>Попробовать скачать</a></div> : file.kind === 'video_note' ? <VideoNoteBubble key={`${file.id}/${attempt}`} file={file}/> : isVideoAttachment(file) ? <video key={`${file.id}/${attempt}`} src={file.url} poster={file.thumbnailUrl} controls playsInline preload="metadata" onPlay={() => { pauseChatVoice(); pauseChatVideoNote(); }} onError={() => setFailed(true)} /> : <img key={`${file.id}/${attempt}`} src={file.url} alt={`${t.photo} ${index + 1}`} onError={() => setFailed(true)} />}</div>
    <footer><button className="chat-icon-button" disabled={index === 0} aria-label={t.previous} onClick={previous}><ChatIcon name="chevron-left" /></button>{onJump && <button className="chat-gallery-jump" onClick={onJump}>К сообщению</button>}<button className="chat-icon-button" disabled={index === images.length - 1} aria-label={t.next} onClick={next}><ChatIcon name="chevron-right" /></button></footer>
  </dialog>;
}
