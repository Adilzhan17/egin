"""Bound private inference requests before JSON parsing or ONNX execution."""
import asyncio
import json

MAX_BODY_BYTES = 512 * 1024
MAX_INFLIGHT = 2


class RequestLimits:
    def __init__(self, app):
        self.app = app
        self.inflight = 0

    async def reject(self, send, status, message):
        headers = [(b'content-type', b'application/json'), (b'cache-control', b'no-store')]
        if status == 429:
            headers.append((b'retry-after', b'1'))
        await send({'type': 'http.response.start', 'status': status, 'headers': headers})
        await send({'type': 'http.response.body', 'body': json.dumps({'detail': message}).encode()})

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope.get('path') != '/embed' or scope.get('method') != 'POST':
            return await self.app(scope, receive, send)
        headers = dict(scope.get('headers', []))
        if headers.get(b'content-type', b'').split(b';')[0].strip().lower() != b'application/json' or headers.get(b'content-encoding', b'identity') != b'identity':
            return await self.reject(send, 415, 'Use uncompressed application/json')
        if b'content-length' in headers:
            try:
                length = int(headers[b'content-length'])
            except ValueError:
                return await self.reject(send, 400, 'Invalid content length')
            if length < 0 or length > MAX_BODY_BYTES:
                return await self.reject(send, 413, 'Request too large')
        # Uvicorn uses one event loop per worker; reserve before the first await.
        if self.inflight >= MAX_INFLIGHT:
            return await self.reject(send, 429, 'Inference is busy')
        self.inflight += 1
        try:
            chunks, total = [], 0
            try:
                async with asyncio.timeout(10):
                    while True:
                        message = await receive()
                        if message['type'] == 'http.disconnect':
                            return
                        chunk = message.get('body', b'')
                        total += len(chunk)
                        if total > MAX_BODY_BYTES:
                            return await self.reject(send, 413, 'Request too large')
                        chunks.append(chunk)
                        if not message.get('more_body', False):
                            break
            except TimeoutError:
                return await self.reject(send, 408, 'Request body timed out')
            body, delivered = b''.join(chunks), False

            async def bounded_receive():
                nonlocal delivered
                if delivered:
                    return await receive()
                delivered = True
                return {'type': 'http.request', 'body': body, 'more_body': False}

            await self.app(scope, bounded_receive, send)
        finally:
            self.inflight -= 1
