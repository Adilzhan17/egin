import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createAttachmentStore } from '../chat/attachments.mjs';

const types = new Map([
  ['image/jpeg', 'image'], ['image/png', 'image'], ['image/webp', 'image'],
  ['audio/webm', 'audio'], ['audio/ogg', 'audio'], ['audio/mp4', 'audio'],
  ['audio/mpeg', 'audio'], ['audio/wav', 'audio'],
]);
export function createAssetValidator(dataDir) {
  // Share the existing bounded image/audio decoders. Client MIME is only a
  // category hint: bytes are decoded and re-encoded before they reach SQLite.
  const store = createAttachmentStore(resolve(dataDir, 'workspace-validation'));
  return async (buffer, mime) => {
    if (!types.has(mime) || !Buffer.isBuffer(buffer) || !buffer.length)
      throw Object.assign(new Error('Неподдерживаемое вложение'), { status: 400 });
    if (buffer.length > 8 * 1024 * 1024)
      throw Object.assign(new Error('Максимальный размер вложения — 8 МБ'), { status: 413 });
    let saved;
    try {
      saved = await store.save(buffer, { kind: types.get(mime), name: 'attachment' });
      const data = await readFile(store.path(saved.storageKey));
      if (data.length > 8 * 1024 * 1024)
        throw Object.assign(new Error('Обработанное вложение превышает 8 МБ'), { status: 413 });
      return { data, mime: saved.mimeType };
    } finally {
      if (saved) await store.remove(saved.storageKey);
    }
  };
}
