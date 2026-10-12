export type Person = { id: string; name: string };
export type ChatKind = 'direct' | 'market' | 'group';
export type MessageKind = 'text' | 'image' | 'document' | 'audio' | 'listing_reference' | 'location';
export type Attachment = { id: string; kind: 'image' | 'document' | 'audio'; name: string; mimeType: string; size: number; url: string; thumbnailUrl?: string; width?: number; height?: number; duration?: number; waveform?: number[] };
export type ListingReference = { id: string; title: string; status: string; priceAmount: number | null; priceMode: string; priceUnit: string; regionName: string; imageUrl?: string; url: string };
export type MessageReceipt = { recipientCount: number; deliveredCount: number; readCount: number; version: number };
export type Message = { id: string; conversationId: string; sender: Person; clientId: string; sequence: number; kind: MessageKind; text: string; createdAt: string; editedAt: string | null; deletedAt: string | null; attachments: Attachment[]; replyTo: { id: string; text: string; kind: MessageKind; senderName: string } | null; listing: ListingReference | null; location: { latitude: number; longitude: number; label?: string } | null; readByCount: number; receipt?: MessageReceipt | null };
export type Member = Person & { role: 'owner' | 'admin' | 'member'; canWrite: boolean; joinedAt: string; lastReadSequence: number };
export type Group = { name: string; description: string; category: string; region: string; access: 'public' | 'private'; avatarUrl?: string; memberCount: number };
export type Conversation = { id: string; kind: ChatKind; title: string; updatedAt: string; createdAt: string; unreadCount: number; muted: boolean; pinned: boolean; blocked: boolean; canWrite: boolean; role: Member['role']; peer: Person | null; group: Group | null; listing: ListingReference | null; lastMessage: Message | null };
export type Community = Group & { id: string; joined: boolean; reason: string };
export type ChatPreferences = { region: string; interests: string[]; excludedCategories: string[] };
export type MessageDraft = { clientId: string; kind: MessageKind; text?: string; attachmentIds?: string[]; replyToMessageId?: string; listingId?: string; location?: { latitude: number; longitude: number; label?: string } };
export const groupCategories = [
  { id: 'crops', name: 'Растениеводство' }, { id: 'livestock', name: 'Животноводство' },
  { id: 'agronomy', name: 'Агрономия' }, { id: 'machinery', name: 'Техника' },
  { id: 'logistics', name: 'Логистика' }, { id: 'trade', name: 'Купля-продажа' },
  { id: 'jobs', name: 'Работа' }, { id: 'other', name: 'Другое' },
] as const;
