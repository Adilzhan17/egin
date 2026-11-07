import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PDFDocument, PDFName, PDFDict, PDFRawStream } from 'pdf-lib';
import { createReport } from '../src/features/workspace/report-export.ts';
import { createPdfReport } from '../src/features/workspace/report-pdf.ts';

const data = { fields: [], entries: [], exportedAt: '2026-11-07T00:00:00Z' };
const brand = readFileSync(new URL('../src/shared/brand/wordmark.png', import.meta.url));

test('HTML export embeds the original wordmark without external image dependencies', () => {
  const uri = `data:image/png;base64,${brand.toString('base64')}`;
  const report = createReport(data, 'html', uri);
  assert.ok(report.content.includes(`src="${uri}"`));
  assert.ok(!createReport(data, 'html', '" onerror="alert(1)').content.includes('onerror'));
});

test('PDF export embeds original-resolution artwork as a self-contained image', async () => {
  const font = readFileSync(new URL('../src/features/workspace/fonts/PTSans-Regular.ttf', import.meta.url));
  const bytes = await createPdfReport(data, Uint8Array.from(font).buffer, Uint8Array.from(brand).buffer);
  const pdf = await PDFDocument.load(bytes);
  const objects = pdf.getPage(0).node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
  const images = objects.values().map(ref => pdf.context.lookup(ref, PDFRawStream));
  assert.ok(images.some(img => img.dict.get(PDFName.of('Width'))?.toString() === '2172' && img.dict.get(PDFName.of('Height'))?.toString() === '724'));
});
