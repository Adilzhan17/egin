import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { ReportData } from './report-export';

/** A local, text-based report. Data absent from the workspace is never fabricated. */
export async function createPdfReport(data:ReportData,fontBytes:ArrayBuffer,brandBytes?:ArrayBuffer):Promise<Uint8Array> {
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const font=await pdf.embedFont(fontBytes,{subset:true});const allowed=new Set(font.getCharacterSet());
  let page=pdf.addPage([595.28,841.89]),y=790;
  const clean=(text:string)=>Array.from(text).map(ch=>ch==='\n'||allowed.has(ch.codePointAt(0)!)?ch:'?').join('');
  const pageBreak=(needed:number)=>{if(y-needed<52){page=pdf.addPage([595.28,841.89]);y=790;}};
  const line=(text:string,size=11,color=rgb(.16,.22,.19))=>{pageBreak(size+9);page.drawText(clean(text),{x:48,y,size,font,color});y-=size+7;};
  function paragraph(text:string,size=11){
    for(const section of clean(text).split('\n')){let current='';for(const word of section.split(/\s+/)){let rest=word;while(rest){let chunk=rest;while(chunk.length>1&&font.widthOfTextAtSize(chunk,size)>499)chunk=chunk.slice(0,-1);const candidate=current?`${current} ${chunk}`:chunk;if(font.widthOfTextAtSize(candidate,size)>499&&current){line(current,size);current=chunk;}else current=candidate;rest=rest.slice(chunk.length);if(rest){line(current,size);current='';}}}if(current)line(current,size);else if(!section)y-=8;}
  }
  if(brandBytes){const logo=await pdf.embedPng(brandBytes);const width=156,height=width*logo.height/logo.width;page.drawImage(logo,{x:48,y:y-height,width,height});y-=height+12;}
  line('Отчёт по участкам',23,rgb(.1,.29,.21));
  line(`Сформировано: ${new Date(data.exportedAt).toLocaleString('ru-RU')}`,10);
  line(`Период истории: ${data.from||'без начальной даты'} — ${data.to||'без конечной даты'}`,10);y-=10;
  if(!data.fields.length)paragraph('В выбранном отчёте нет сохранённых участков.');
  const sources={user:'Введено пользователем',geojson:'Импорт GeoJSON',demo:'Демонстрационный участок','public-map':'Публичная карта ЕГКН'};
  const crops={wheat:'пшеница',tomato:'томаты',apple:'яблоня',sunflower:'подсолнечник',unknown:'не указана'};
  for(const field of data.fields){
    pageBreak(100);line(field.name,16,rgb(.1,.29,.21));
    paragraph(`Площадь: ${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(field.area)} га. Культура: ${crops[field.crop]}.`);
    paragraph(`Кадастровый номер: ${field.cadastre?.number||'не указан'}. Источник границ: ${field.cadastre?sources[field.cadastre.source]:'не указан'}.`);
    if(field.cadastre?.details)paragraph(`Сведения ЕГКН получены: ${new Date(field.cadastre.details.fetchedAt).toLocaleString('ru-RU')}. Сведения могут требовать обновления.`);
    paragraph(`Границы: ${field.boundary?'сохранены на устройстве':'нет сохранённого контура'}. Координаты: ${field.latitude}, ${field.longitude}.`);y-=9;
  }
  line('История участка',16,rgb(.1,.29,.21));
  if(!data.entries.length)paragraph('За выбранный период сохранённых записей нет.');
  for(const entry of data.entries){pageBreak(48);paragraph(`${entry.date} · ${entry.title}`,12);if(entry.text)paragraph(entry.text);if(entry.assets.length)paragraph(`Вложения в PDF не включены: ${entry.assets.length}.`,10);y-=6;}
  y-=4;line('Источники и ограничения',16,rgb(.1,.29,.21));
  paragraph('Участки и история: сохранённые данные этого устройства. Погода и события из внешних источников в этот отчёт не включены. Подтверждённых измерений датчиков в отчёте нет; это не означает отсутствие датчиков или проблем.');
  pdf.setTitle('EGIN — отчёт по участкам');pdf.setProducer('EGIN');pdf.setCreationDate(new Date(data.exportedAt));return pdf.save();
}
