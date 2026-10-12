import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { resolve, basename, extname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import yauzl from 'yauzl';
import { load } from 'cheerio';

const run = promisify(execFile);
const invalid = (message = 'Файл повреждён или имеет неподдерживаемый формат.', status = 422) => Object.assign(new Error(message), { status });
const safeName = value => basename(String(value || 'Вложение').replaceAll('\\', '/')).replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, 160) || 'Вложение';
const renamed = (value, extension) => safeName(value).replace(/\.[^.]*$/, '') + extension;
const mime = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
const namedElements = (document, name) => document('*').toArray().filter(node => node.name?.split(':').at(-1) === name);
function xmlText(buffer) {
  const utf16le = buffer[0] === 0xff && buffer[1] === 0xfe || buffer[0] === 0x3c && buffer[1] === 0;
  const utf16be = buffer[0] === 0xfe && buffer[1] === 0xff || buffer[0] === 0 && buffer[1] === 0x3c;
  let content;
  try { content = new TextDecoder(utf16le ? 'utf-16le' : utf16be ? 'utf-16be' : 'utf-8', { fatal: true }).decode(buffer); } catch { throw invalid('Неподдерживаемая кодировка документа.'); }
  const encoding = content.match(/^\s*<\?xml[^>]*encoding\s*=\s*["']([^"']+)/i)?.[1];
  if (encoding && !/^(utf-?8|utf-?16(?:le|be)?)$/i.test(encoding)) throw invalid('Неподдерживаемая кодировка документа.');
  if (content.includes('\0')) throw invalid();
  return content;
}

function checkOfficeXML(document) {
  // OOXML allows arbitrary namespace prefixes and XML character references.
  // Inspect decoded element/attribute values rather than searching only raw XML.
  for (const node of document('*').toArray()) {
    for (const value of Object.values(node.attribs || {})) {
      if (/macroEnabled|macroSheet|vbaProject|oleObject|activeX/i.test(value)) throw invalid('Документы с активным содержимым не поддерживаются.');
    }
  }
  for (const relationship of namedElements(document, 'Relationship')) {
    const attributes = relationship.attribs || {};
    if (/(?:^|\/)(?:oleObject|package|aFChunk|attachedTemplate|control)$/i.test(attributes.Type || '')) throw invalid('Встроенные объекты и шаблоны Office не поддерживаются.');
    if (attributes.TargetMode === 'External' && (!attributes.Type?.endsWith('/hyperlink') || !/^https?:\/\//i.test(attributes.Target || ''))) throw invalid('Документ содержит небезопасные внешние подключения.');
  }
  // Word may split a field instruction across several runs; scan their joined text.
  const instructions = namedElements(document, 'instrText').map(node => document(node).text()).join('') + ' ' + namedElements(document, 'fldSimple').map(node => Object.entries(node.attribs || {}).filter(([key]) => key.split(':').at(-1) === 'instr').map(([, value]) => value).join(' ')).join(' ');
  if (/\b(?:DDE(?:AUTO)?|INCLUDETEXT|INCLUDEPICTURE|DATABASE|LINK)\b/i.test(instructions)) throw invalid('Внешние поля Word не поддерживаются.');
  // Ordinary arithmetic remains supported. Network, XLM, DDE and external-workbook
  // formulas are rejected even when encoded or placed in a defined name.
  for (const node of [...namedElements(document, 'f'), ...namedElements(document, 'definedName')]) {
    const formula = document(node).text();
    if (/\||\[[^\]]+\][^!()[\]]*!|\b(?:WEBSERVICE|RTD|CALL|REGISTER(?:\.ID)?|EXEC|RUN|EVALUATE|GET\.WORKSPACE|SEND\.KEYS|SQL\.REQUEST|IMPORTDATA|IMPORTXML|HYPERLINK|IMAGE)\s*\(/i.test(formula)) throw invalid('Формулы с внешними подключениями не поддерживаются.');
  }
}

/** Read bounded OOXML ZIP entries in memory; never extract user paths to disk. */
export async function validateOffice(buffer, extension) {
  const zip = await new Promise((accept, reject) => yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, value) => error ? reject(invalid()) : accept(value)));
  const names = new Set(), xml = new Map(); let expanded = 0, count = 0;
  await new Promise((accept, reject) => {
    let finished = false;
    const fail = error => { if (!finished) { finished = true; zip.close(); reject(error.status ? error : invalid()); } };
    zip.on('error', fail);
    zip.on('end', () => { if (!finished) { finished = true; accept(); } });
    zip.on('entry', entry => {
      void (async () => {
        const name = entry.fileName, lower = name.toLowerCase();
        expanded += entry.uncompressedSize; count++;
        if (count > 2000 || expanded > 40 * 1024 * 1024 || entry.uncompressedSize > 20 * 1024 * 1024 || names.has(lower) || (entry.generalPurposeBitFlag & 1) || ![0, 8].includes(entry.compressionMethod)) throw invalid('Документ зашифрован или превышает ограничения распаковки.');
        if (/(^|\/)(activex|embeddings|externallinks|customui|macrosheets)(\/|$)|vbaproject|\.(exe|dll|js|html?|vbs|bat|ps1)$/.test(lower)) throw invalid('Документы с макросами и встроенными программами не поддерживаются.');
        names.add(lower);
        const isXML = /\.(xml|rels)$/i.test(name);
        if (isXML && entry.uncompressedSize > 8 * 1024 * 1024) throw invalid('Слишком сложный документ.');
        const stream = await new Promise((yes, no) => zip.openReadStream(entry, (error, value) => error ? no(error) : yes(value)));
        const chunks = []; let size = 0;
        for await (const chunk of stream) { size += chunk.length; if (size > (isXML ? 8 : 20) * 1024 * 1024) { stream.destroy(); throw invalid(); } if (isXML) chunks.push(chunk); }
        // Also inflate non-XML resources to verify their actual expanded size.
        // Trusting only a ZIP central-directory size permits hidden decompression bombs.
        if (!isXML) { zip.readEntry(); return; }
        const content = xmlText(Buffer.concat(chunks));
        if (/<!DOCTYPE|<!ENTITY|\bDDEAUTO\b|\bDDE\s|macroEnabled|vbaProject/i.test(content)) throw invalid('Активное содержимое документа не поддерживается.');
        const document = load(content, { xmlMode: true });
        checkOfficeXML(document);
        if (name === '[Content_Types].xml' || name === 'word/document.xml' || name === 'xl/workbook.xml' || name === '_rels/.rels') xml.set(name, content);
        zip.readEntry();
      })().catch(fail);
    });
    zip.readEntry();
  }).finally(() => zip.close());
  const main = extension === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
  const contentType = extension === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
  if (!xml.has(main) || !xml.has('_rels/.rels') || !xml.has('[Content_Types].xml')) throw invalid('Это не документ выбранного типа.');
  const types = load(xml.get('[Content_Types].xml'), { xmlMode: true });
  if (!namedElements(types, 'Override').some(node => node.attribs?.PartName === '/' + main && node.attribs?.ContentType === contentType)) throw invalid('Тип документа не соответствует содержимому.');
  const relationships = load(xml.get('_rels/.rels'), { xmlMode: true });
  if (!namedElements(relationships, 'Relationship').some(node => node.attribs?.Type?.endsWith('/officeDocument') && node.attribs?.Target?.replace(/^\//, '') === main)) throw invalid('Повреждена структура документа.');
  const document = load(xml.get(main), { xmlMode: true });
  if (!namedElements(document, extension === 'docx' ? 'document' : 'workbook').length) throw invalid('Повреждено содержимое документа.');
}

export function createAttachmentStore(dataDir) {
  const root = resolve(dataDir, 'chat-attachments');
  let active = 0;
  function path(key, { thumbnail = false } = {}) {
    if (!/^[a-f0-9-]{36}\.(webp|pdf|docx|xlsx|m4a)$/.test(key)) throw invalid('Вложение не найдено.', 404);
    return resolve(root, key + (thumbnail ? '.thumb.webp' : ''));
  }
  async function remove(key) { await Promise.all([path(key), path(key, { thumbnail: true })].map(file => unlink(file).catch(() => {}))); }
  async function save(buffer, { kind, name }) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw invalid('Выберите непустой файл.');
    const limit = kind === 'document' ? 15 : 10;
    if (buffer.length > limit * 1024 * 1024) throw invalid(`Максимальный размер файла — ${limit} МБ.`, 413);
    if (!['image', 'document', 'audio'].includes(kind)) throw invalid();
    if (active >= 3) throw invalid('Обрабатываем другие вложения. Повторите через несколько секунд.', 429);
    active++;
    const id = randomUUID(); let key, temporary;
    try {
      await mkdir(root, { recursive: true, mode: 0o700 });
      if (kind === 'image') {
        const metadata = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata();
        if (!['jpeg', 'png', 'webp', 'heif'].includes(metadata.format) || (metadata.pages || 1) > 1) throw invalid('Поддерживаются фотографии JPEG, PNG и WebP без анимации.');
        const image = await sharp(buffer, { limitInputPixels: 40_000_000 }).rotate().resize(1800, 1800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
        key = `${id}.webp`;
        await writeFile(path(key), image.data, { mode: 0o600, flag: 'wx' });
        await sharp(image.data).resize(480, 480, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 76 }).toFile(path(key, { thumbnail: true }));
        return { storageKey: key, kind, mimeType: 'image/webp', size: image.data.length, width: image.info.width, height: image.info.height, name: renamed(name, '.webp') };
      }
      if (kind === 'document') {
        const extension = extname(safeName(name)).slice(1).toLowerCase();
        if (!mime[extension]) throw invalid('Поддерживаются документы PDF, DOCX и XLSX.');
        key = `${id}.${extension}`;
        if (extension === 'pdf') {
          if (!buffer.subarray(0, 8).toString('ascii').startsWith('%PDF-')) throw invalid('Это не PDF.');
          temporary = resolve(root, `${id}.input`);
          await writeFile(temporary, buffer, { mode: 0o600, flag: 'wx' });
          await run('qpdf', ['--check', temporary], { timeout: 12000, maxBuffer: 1024 * 1024 });
          const { stdout } = await run('qpdf', ['--json', '--json-stream-data=none', temporary], { timeout: 12000, maxBuffer: 8 * 1024 * 1024 });
          const parsed = JSON.parse(stdout);
          if (parsed.encrypt?.encrypted || /"\/(JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|OpenAction|AA|XFA|SubmitForm|ImportData)"/.test(stdout)) throw invalid('PDF с паролем, программами или встроенными файлами не поддерживается.');
        } else await validateOffice(buffer, extension);
        await writeFile(path(key), buffer, { mode: 0o600, flag: 'wx' });
        return { storageKey: key, kind, mimeType: mime[extension], size: buffer.length, name: safeName(name) };
      }
      const signature = buffer.subarray(0, 16);
      if (!(signature.readUInt32BE(0) === 0x1a45dfa3 || signature.toString('ascii', 0, 4) === 'OggS' || signature.toString('ascii', 4, 8) === 'ftyp' || signature.toString('ascii', 0, 4) === 'RIFF')) throw invalid('Это не поддерживаемая голосовая запись.');
      temporary = resolve(root, `${id}.input`);
      await writeFile(temporary, buffer, { mode: 0o600, flag: 'wx' });
      const probe = async file => JSON.parse((await run('ffprobe', ['-v', 'error', '-max_alloc', '67108864', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration,format_name:stream=codec_type,duration', '-of', 'json', file], { timeout: 12000, maxBuffer: 1024 * 1024 })).stdout);
      const input = await probe(temporary);
      if (!input.streams?.length || input.streams.some(stream => stream.codec_type !== 'audio') || !/^(matroska,webm|ogg|mov,mp4,m4a,3gp,3g2,mj2|wav)$/.test(input.format?.format_name || '')) throw invalid('Отправьте голосовую запись без видео.');
      const duration = Number(input.format?.duration);
      if (Number.isFinite(duration) && duration > 181) throw invalid('Голосовое сообщение должно быть не длиннее 3 минут.');
      key = `${id}.m4a`;
      await run('ffmpeg', ['-nostdin', '-v', 'error', '-max_alloc', '67108864', '-protocol_whitelist', 'file,pipe', '-i', temporary, '-map', '0:a:0', '-map_metadata', '-1', '-vn', '-t', '181', '-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k', '-threads', '1', '-movflags', '+faststart', path(key)], { timeout: 30000, maxBuffer: 1024 * 1024 });
      const output = await probe(path(key)), seconds = Number(output.format?.duration);
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 180.8) throw invalid('Голосовое сообщение должно быть не длиннее 3 минут.');
      // Decode the validated, server-owned AAC output, never user-supplied peaks.
      // 181 seconds of mono 8 kHz s16 PCM fits within the 3 MiB output cap.
      const { stdout: pcm } = await run('ffmpeg', ['-nostdin', '-v', 'error', '-max_alloc', '67108864', '-protocol_whitelist', 'file,pipe', '-i', path(key), '-map', '0:a:0', '-vn', '-t', '181', '-ac', '1', '-ar', '8000', '-f', 's16le', '-threads', '1', 'pipe:1'], { timeout: 12000, maxBuffer: 3 * 1024 * 1024, encoding: 'buffer' });
      const samples = Math.floor(pcm.length / 2);
      if (!samples) throw invalid('Голосовая запись пуста.');
      const peaks = Array.from({ length: 40 }, (_, index) => {
        let peak = 0;
        const start = Math.floor(index * samples / 40), end = Math.max(start + 1, Math.floor((index + 1) * samples / 40));
        for (let sample = start; sample < Math.min(samples, end); sample++) peak = Math.max(peak, Math.abs(pcm.readInt16LE(sample * 2)) / 32768);
        return peak;
      });
      const maximum = Math.max(...peaks);
      const waveform = peaks.map(peak => maximum ? Math.round(peak / maximum * 1000) / 1000 : 0);
      const data = await readFile(path(key));
      return { storageKey: key, kind, mimeType: 'audio/mp4', size: data.length, duration: seconds, waveform, name: 'Голосовое сообщение.m4a' };
    } catch (error) {
      if (key) await remove(key);
      if (error.status) throw error;
      if (error.code === 'ENOENT') throw invalid('Обработка этого типа файлов временно недоступна.', 503);
      throw invalid();
    } finally {
      active--;
      if (temporary) await unlink(temporary).catch(() => {});
    }
  }
  return { save, remove, path };
}
