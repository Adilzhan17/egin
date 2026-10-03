"""Single-process wakeups. Message history and replay live in PostgreSQL."""
import asyncio
from collections import defaultdict
class RealtimeBroker:
    def __init__(self):self.events=defaultdict(asyncio.Event)
    def publish(self,conversation_id):
        key=str(conversation_id);self.events[key].set();self.events[key]=asyncio.Event()
broker=RealtimeBroker()
