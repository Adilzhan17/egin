import jsQR from 'jsqr';

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

/** Preserve small QR modules: inspect the aiming area at its original resolution. */
export function createQRDecoder() {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  let detector: Detector | null = null;
  try {
    const Native = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    if (Native) detector = new Native({ formats: ['qr_code'] });
  } catch { /* jsQR also works in browsers without native QR support. */ }
  return async (source: CanvasImageSource, width: number, height: number, photo = false, cancelled = () => false): Promise<string | null> => {
    if (!context || !width || !height || cancelled()) return null;
    if (detector) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const found = await Promise.race([
          detector.detect(source),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('QR detector timeout')), 700); }),
        ]);
        if (cancelled()) return null;
        if (found[0]?.rawValue) return found[0].rawValue;
      } catch { detector = null; }
      finally { clearTimeout(timer); }
    }
    const side = Math.min(width, height);
    const regions = [
      { x: 0, y: 0, w: width, h: height, max: 1280 },
      ...[0.7, 0.35].map(fraction => ({ x: (width - side * fraction) / 2, y: (height - side * fraction) / 2, w: side * fraction, h: side * fraction, max: 1100 })),
    ];
    // A photo may contain a QR outside the centre. Overlapping tiles avoid losing
    // its detail when shrinking a 12/24MP photograph to a small canvas.
    if (photo && Math.max(width, height) > 1600) {
      const tile = Math.min(1600, side);
      const columns = Math.ceil((width - tile) / (tile * 0.75)) + 1;
      const rows = Math.ceil((height - tile) / (tile * 0.75)) + 1;
      for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        regions.push({ x: columns === 1 ? 0 : column * (width - tile) / (columns - 1), y: rows === 1 ? 0 : row * (height - tile) / (rows - 1), w: tile, h: tile, max: 1600 });
      }
    }
    for (const region of regions) {
      if (cancelled()) return null;
      const scale = Math.min(1, region.max / Math.max(region.w, region.h));
      canvas.width = Math.max(1, Math.round(region.w * scale));
      canvas.height = Math.max(1, Math.round(region.h * scale));
      context.drawImage(source, region.x, region.y, region.w, region.h, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(pixels.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
      if (result?.data) return result.data;
      // Keep stop/navigation responsive between expensive decoding passes.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return null;
  };
}
