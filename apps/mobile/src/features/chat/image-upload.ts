/** Downscale before transfer. The server independently verifies and re-encodes every image. */
export async function optimizeChatImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return file;
  let bitmap: ImageBitmap | null = null; let image: HTMLImageElement | null = null; let url: string | null = null;
  try {
    if (typeof createImageBitmap === 'function') bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    else {
      url = URL.createObjectURL(file); image = new Image(); image.src = url;
      await new Promise<void>((resolve, reject) => { image!.onload = () => resolve(); image!.onerror = () => reject(new Error('Не удалось прочитать изображение')); });
    }
    const source = bitmap || image!; const width = bitmap?.width || image!.naturalWidth; const height = bitmap?.height || image!.naturalHeight;
    if (!width || !height || width * height > 40_000_000) throw new Error('Изображение слишком большое. Максимум — 40 мегапикселей.');
    const ratio = Math.min(1, 1800 / Math.max(width, height)); const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
    const context = canvas.getContext('2d'); if (!context) throw new Error('Обработка фотографии недоступна в этом браузере');
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Не удалось подготовить фотографию')), 'image/webp', .82));
    const extension = blob.type === 'image/webp' ? 'webp' : 'png';
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.${extension}`, { type: blob.type });
  } finally { bitmap?.close(); if (url) URL.revokeObjectURL(url); }
}
