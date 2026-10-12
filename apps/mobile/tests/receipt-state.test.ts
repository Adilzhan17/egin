import assert from 'node:assert/strict';
import test from 'node:test';
import { newestReceipt } from '../src/features/chat/receipt-state.ts';
import type { MessageReceipt } from '../src/features/chat/types.ts';

const receipt = (version: number, recipientCount: number, deliveredCount: number, readCount: number): MessageReceipt => ({ version, recipientCount, deliveredCount, readCount });

test('newer membership revision replaces counts when a participant leaves', () => {
  const before = receipt(10, 3, 3, 2), after = receipt(11, 2, 2, 1);
  assert.deepEqual(newestReceipt(before, after), after);
  // A delayed HTTP snapshot or reordered SSE must not restore the departed member.
  assert.deepEqual(newestReceipt(after, before), after);
});

test('new participant increases the denominator without inventing delivery or reads', () => {
  const allReadBeforeJoin = receipt(20, 2, 2, 2), newlyJoined = receipt(21, 3, 2, 2);
  assert.deepEqual(newestReceipt(allReadBeforeJoin, newlyJoined), newlyJoined);
  assert.deepEqual(newestReceipt(newlyJoined, allReadBeforeJoin), newlyJoined);
  const acknowledged = receipt(22, 3, 3, 2);
  assert.deepEqual(newestReceipt(newlyJoined, acknowledged), acknowledged);
});

test('rejoining with empty cursors may reduce counts even with the same denominator', () => {
  const before = receipt(30, 2, 2, 2), afterRejoin = receipt(32, 2, 1, 1);
  assert.deepEqual(newestReceipt(before, afterRejoin), afterRejoin);
  assert.deepEqual(newestReceipt(afterRejoin, receipt(31, 1, 1, 1)), afterRejoin);
});

test('equal-revision defensive merge is monotonic and idempotent with unchanged membership', () => {
  const previous = receipt(40, 3, 2, 1), incoming = receipt(40, 3, 3, 0);
  const merged = receipt(40, 3, 3, 1);
  assert.deepEqual(newestReceipt(previous, incoming), merged);
  assert.deepEqual(newestReceipt(incoming, previous), merged);
  assert.deepEqual(newestReceipt(merged, previous), merged);
  assert.deepEqual(newestReceipt(merged, merged), merged);
});

test('conflicting denominators at one revision cannot replace the known snapshot', () => {
  const previous = receipt(50, 3, 2, 1);
  assert.deepEqual(newestReceipt(previous, receipt(50, 1, 1, 1)), previous);
  assert.deepEqual(newestReceipt(previous, receipt(50, 5, 3, 2)), previous);
});

test('missing old-slot receipts remain unknown and cannot erase a confirmed snapshot', () => {
  const confirmed = receipt(60, 1, 1, 1);
  assert.equal(newestReceipt(undefined, undefined), undefined);
  assert.equal(newestReceipt(undefined, null), null);
  assert.deepEqual(newestReceipt(undefined, confirmed), confirmed);
  assert.deepEqual(newestReceipt(null, confirmed), confirmed);
  assert.deepEqual(newestReceipt(confirmed, undefined), confirmed);
  assert.deepEqual(newestReceipt(confirmed, null), confirmed);
});

test('zero remaining recipients is retained as zero, without synthetic receipt evidence', () => {
  const empty = receipt(71, 0, 0, 0);
  assert.deepEqual(newestReceipt(receipt(70, 1, 1, 1), empty), empty);
});

test('receipt merge does not mutate previously rendered or incoming snapshots', () => {
  const previous = Object.freeze(receipt(80, 3, 2, 1)), incoming = Object.freeze(receipt(80, 3, 3, 0));
  assert.deepEqual(newestReceipt(previous, incoming), receipt(80, 3, 3, 1));
  assert.deepEqual(previous, receipt(80, 3, 2, 1));
  assert.deepEqual(incoming, receipt(80, 3, 3, 0));
});
