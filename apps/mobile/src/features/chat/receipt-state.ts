import type { MessageReceipt } from './types.ts';

// Membership changes legitimately alter the denominator and counts. Only the
// server revision, not a maximum count, orders these snapshots across devices.
export function newestReceipt(previous?: MessageReceipt | null, incoming?: MessageReceipt | null): MessageReceipt | null | undefined {
  if (!incoming) return previous ?? incoming;
  if (!previous || incoming.version > previous.version) return incoming;
  if (incoming.version < previous.version) return previous;
  if (incoming.recipientCount !== previous.recipientCount) return previous;
  return { ...incoming, deliveredCount: Math.max(previous.deliveredCount, incoming.deliveredCount), readCount: Math.max(previous.readCount, incoming.readCount) };
}
