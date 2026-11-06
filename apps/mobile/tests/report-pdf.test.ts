import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { createPdfReport } from '../src/features/workspace/report-pdf.ts';

test('PDF report embeds a Cyrillic font and paginates long saved records',async()=>{
  const font=await readFile(new URL('../src/features/workspace/fonts/PTSans-Regular.ttf',import.meta.url));
  const bytes=await createPdfReport({exportedAt:'2026-11-05T12:00:00Z',from:'2026-01-01',to:'2026-11-01',fields:[{id:'field',name:'Северный участок',latitude:44,longitude:65,area:42,crop:'wheat'}],entries:[{id:'entry',title:'Осмотр почвы',text:'Сохранённое наблюдение. '.repeat(600),date:'2026-10-01',fieldId:'field',assets:[]}]},Uint8Array.from(font).buffer);
  assert.equal(Buffer.from(bytes.subarray(0,5)).toString(),'%PDF-');
  const pdf=await PDFDocument.load(bytes);assert.ok(pdf.getPageCount()>1);assert.equal(pdf.getTitle(),'EGIN — отчёт по участкам');
});
