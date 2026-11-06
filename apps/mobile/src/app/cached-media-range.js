// Embedded in the service worker; keep this helper self-contained. WebKit
// requests byte ranges even for small, fully precached launch videos.
export async function cachedMediaRange(request, response) {
  const range = request.headers.get('range');
  if (!range || response.status !== 200) return response;
  const ifRange = request.headers.get('if-range');
  if (ifRange && ifRange !== response.headers.get('etag') && ifRange !== response.headers.get('last-modified')) return response;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  // Multiple or malformed ranges can be ignored and served as a full response.
  if (!match || (!match[1] && !match[2])) return response;
  const body = await response.blob();
  const size = body.size;
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  let end = match[1] && match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  end = Math.min(end, size - 1);
  const headers = new Headers(response.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.delete('Content-Encoding');
  return new Response(body.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers });
}
