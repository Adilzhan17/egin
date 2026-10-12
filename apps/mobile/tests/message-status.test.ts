import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveMessageStatus, hasServerMessageAck, type MessageReceipt, type StatusMessage } from '../src/features/chat/message-status.ts';

const server: StatusMessage = { id: 'message-server-id', sequence: 12, readByCount: 0 };
const local: StatusMessage = { id: 'local-stable-client-uuid', sequence: 0, readByCount: 0 };
const receipt = (recipientCount: number, deliveredCount: number, readCount: number, version = 1): MessageReceipt => ({ recipientCount, deliveredCount, readCount, version });
const status = (counts?: MessageReceipt | null, group = false) => deriveMessageStatus({ ...server, receipt: counts }, { group })!;

test('local identity and positive sequence are not interchangeable with a server ACK', () => {
  assert.equal(hasServerMessageAck(local), false);
  assert.equal(hasServerMessageAck({ ...server, id: '' }), false);
  assert.equal(hasServerMessageAck({ ...server, sequence: NaN }), false);
  assert.equal(hasServerMessageAck({ ...server, sequence: 0.5 }), false);
  assert.equal(hasServerMessageAck(server), true);
  for (const localState of ['queued', 'sending', 'failed'] as const) {
    const result = deriveMessageStatus(local, { group: false, localState })!;
    assert.equal(result.kind, localState);
    assert.equal(result.acknowledged, false);
    assert(!['check', 'double-check'].includes(result.icon));
  }
});

test('persisted server ACK produces one check while offline recipient has no delivery ACK', () => {
  const result = status(receipt(1, 0, 0));
  assert.equal(result.kind, 'sent');
  assert.equal(result.icon, 'check');
  assert.equal(result.deliveredCount, 0);
  assert.equal(result.readCount, 0);
});

test('receiver delivery ACK and confirmed read are distinct direct states', () => {
  assert.equal(status(receipt(1, 1, 0)).kind, 'delivered');
  assert.equal(status(receipt(1, 1, 0)).icon, 'double-check');
  assert.equal(status(receipt(1, 1, 1)).kind, 'read');
  assert.equal(status(receipt(1, 1, 1)).icon, 'double-check');
});

test('response-loss retry failure cannot override a reconciled committed server copy', () => {
  assert.equal(deriveMessageStatus(server, { group: false, localState: 'failed' })!.kind, 'sent');
  assert.equal(deriveMessageStatus({ ...server, receipt: receipt(1, 1, 1) }, { group: false, localState: 'sending' })!.kind, 'read');
});

test('one group recipient ACK is not delivery to everyone', () => {
  const partialDelivery = status(receipt(4, 1, 0), true);
  assert.equal(partialDelivery.kind, 'sent');
  assert.equal(partialDelivery.icon, 'check');
  assert.equal(partialDelivery.deliveredCount, 1);
  assert.equal(partialDelivery.recipientCount, 4);
  assert.equal(status(receipt(4, 4, 0), true).kind, 'delivered');
});

test('partial group reads use a neutral eye and real N/M even when everyone received', () => {
  for (const delivered of [2, 4]) {
    const result = status(receipt(4, delivered, 2), true);
    assert.equal(result.kind, 'partial-read');
    assert.equal(result.icon, 'eye');
    assert.equal(result.counter, '2/4');
    assert.equal(result.label, 'Просмотрели 2 из 4 участников');
    assert.equal(result.deliveredCount, delivered);
  }
  assert.equal(status(receipt(4, 4, 4), true).kind, 'read');
});

test('author-only group never claims everyone received or read', () => {
  const result = status(receipt(0, 0, 0), true);
  assert.equal(result.kind, 'sent');
  assert.equal(result.icon, 'check');
  assert.equal(result.recipientCount, 0);
  assert.match(result.explanation, /нет других доступных получателей/);
});

test('authoritative membership changes alter historical denominators', () => {
  assert.equal(status(receipt(2, 2, 2, 5), true).kind, 'read');
  const joined = status(receipt(3, 2, 2, 6), true);
  assert.equal(joined.kind, 'partial-read');
  assert.equal(joined.counter, '2/3');
  const left = status(receipt(2, 2, 2, 7), true);
  assert.equal(left.kind, 'read');
});

test('legacy group reads do not invent denominator from current member count', () => {
  const result = deriveMessageStatus({ ...server, readByCount: 3 }, { group: true })!;
  assert.equal(result.kind, 'partial-read');
  assert.equal(result.counter, '3');
  assert.equal(result.recipientCount, null);
  assert.equal(result.deliveredCount, null);
  assert.match(result.label, /Общее число получателей неизвестно/);
});

test('legacy direct actual read confirmation remains usable; unknown delivery remains unknown', () => {
  const result = deriveMessageStatus({ ...server, readByCount: 1 }, { group: false })!;
  assert.equal(result.kind, 'read');
  assert.equal(result.deliveredCount, null);
  assert.equal(status(undefined).kind, 'sent');
  assert.equal(status(null).kind, 'sent');
});

test('new receipt overrides a stale legacy read counter', () => {
  const result = deriveMessageStatus({ ...server, readByCount: 1, receipt: receipt(1, 0, 0) }, { group: false })!;
  assert.equal(result.kind, 'sent');
  assert.equal(result.readCount, 0);
});

test('malformed aggregate facts cannot fabricate all-read or all-delivered', () => {
  const invalid = [receipt(-1, 0, 0), receipt(1, 2, 0), receipt(1, 1, 2), receipt(2, 0, 1), receipt(NaN, 0, 0), receipt(1, 1, 1, -1), receipt(1.5, 1, 1)];
  for (const candidate of invalid) {
    const result = deriveMessageStatus({ ...server, readByCount: 5, receipt: candidate }, { group: true })!;
    assert.equal(result.kind, 'sent');
    assert.equal(result.readCount, null);
    assert.equal(result.recipientCount, null);
  }
});

test('no local placeholder turns read just because stale counters were attached', () => {
  assert.equal(deriveMessageStatus({ ...local, readByCount: 1, receipt: receipt(1, 1, 1) }, { group: false, localState: 'queued' })!.kind, 'queued');
});

test('deleted messages expose no residual status', () => {
  assert.equal(deriveMessageStatus({ ...server, deletedAt: '2026-10-12T08:00:00Z', receipt: receipt(1, 1, 1) }, { group: false }), null);
});
