import asyncio
import unittest
from limits import RequestLimits, MAX_BODY_BYTES, MAX_INFLIGHT


class LimitTests(unittest.IsolatedAsyncioTestCase):
    async def request(self, middleware, chunks, headers=None, path='/embed'):
        messages = iter([{'type':'http.request','body':body,'more_body':index<len(chunks)-1} for index,body in enumerate(chunks)])
        output = []
        async def receive(): return next(messages)
        async def send(message): output.append(message)
        await middleware({'type':'http','path':path,'method':'POST','headers':headers or [(b'content-type',b'application/json')]},receive,send)
        return output

    async def test_chunked_and_false_content_length_cannot_bypass_body_cap(self):
        called = False
        async def downstream(*args):
            nonlocal called
            called = True
        middleware = RequestLimits(downstream)
        for headers in (None,[(b'content-type',b'application/json'),(b'content-length',b'1')]):
            output = await self.request(middleware,[b'x'*MAX_BODY_BYTES,b'x'],headers)
            self.assertEqual(output[0]['status'],413)
        self.assertFalse(called)
        self.assertEqual(middleware.inflight,0)

    async def test_replays_bounded_body_and_releases_slots_on_failure(self):
        async def downstream(scope,receive,send):
            self.assertEqual((await receive())['body'],b'{"texts":[]}')
            raise RuntimeError('test failure')
        middleware = RequestLimits(downstream)
        with self.assertRaises(RuntimeError): await self.request(middleware,[b'{"texts":',b'[]}'])
        self.assertEqual(middleware.inflight,0)

    async def test_compressed_or_non_json_requests_do_not_reach_parser(self):
        async def downstream(*args): self.fail('must not reach parser')
        middleware = RequestLimits(downstream)
        for headers in ([(b'content-type',b'application/json'),(b'content-encoding',b'gzip')],[(b'content-type',b'text/plain')]):
            self.assertEqual((await self.request(middleware,[b'{}'],headers))[0]['status'],415)

    async def test_overload_is_rejected_but_health_remains_available(self):
        entered, release = asyncio.Event(), asyncio.Event()
        async def downstream(scope,receive,send):
            if scope['path']=='/embed': entered.set(); await release.wait()
            await send({'type':'http.response.start','status':200,'headers':[]})
        middleware = RequestLimits(downstream)
        pending = [asyncio.create_task(self.request(middleware,[b'{}'])) for _ in range(MAX_INFLIGHT)]
        await entered.wait();await asyncio.sleep(0)
        self.assertEqual((await self.request(middleware,[b'{}']))[0]['status'],429)
        self.assertEqual((await self.request(middleware,[b'{}'],path='/health'))[0]['status'],200)
        release.set();await asyncio.gather(*pending)
        self.assertEqual(middleware.inflight,0)


if __name__ == '__main__':
    unittest.main()
