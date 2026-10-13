// Local Vite-only component fixture. Not an application entry point or demo route.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '../../src/shared/styles/tokens.css';
import '../../src/shared/styles/global.css';
import { ChatMaterials } from '../../src/features/chat/ChatMaterials';
import { LocationPicker } from '../../src/features/chat/LocationPicker';
import { LocationCard } from '../../src/features/chat/LocationCard';
import type { ChatLocation } from '../../src/features/chat/location-utils';
import '../../src/features/chat/chat.css';
import '../../src/features/chat/thread.css';

function Fixture() {
  const [mode, setMode] = useState(''), [location, setLocation] = useState<ChatLocation | null>(null), [jump, setJump] = useState('');
  return <main className="chat-page" style={{ maxWidth: 760, margin: 'auto', minHeight: '100dvh', padding: 16, boxSizing: 'border-box' }}>
    <button onClick={() => setMode('location')}>Выбрать геопозицию</button><button onClick={() => setMode('materials')}>Материалы</button>
    {location && <><output hidden data-testid="selected">{JSON.stringify(location)}</output><LocationCard location={location} /></>}
    <output hidden data-testid="jump">{jump}</output>
    {mode === 'location' && <LocationPicker onClose={() => setMode('')} onSelect={point => { setLocation(point); setMode(''); }} />}
    {mode === 'materials' && <ChatMaterials conversationId="test-conversation" onClose={() => setMode('')} onJump={id => { setJump(id); setMode(''); }} />}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
