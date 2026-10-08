import { useState } from 'react';
import { Icon } from '../../shared/ui/Icon';
import { Sheet } from '../../shared/ui/Sheet';

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let promptEvent: InstallEvent | null = null;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); promptEvent = event as InstallEvent; });
window.addEventListener('appinstalled', () => { promptEvent = null; });

export function InstallSheet({ onClose }: { onClose: () => void }) {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const [installed, setInstalled] = useState(() => matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
  const [available, setAvailable] = useState(!!promptEvent), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function install() {
    if (!promptEvent) return;
    setBusy(true);
    try { const event = promptEvent; await event.prompt(); const result = await event.userChoice; if (result.outcome === 'accepted') setInstalled(true); promptEvent = null; setAvailable(false); } catch { setError('Откройте меню браузера и добавьте EGIN на главный экран вручную.'); } finally { setBusy(false); }
  }
  return <Sheet title={installed ? 'EGIN уже с вами' : 'EGIN на вашем телефоне'} onClose={onClose}><div className="install-icon"><Icon name={installed ? 'check' : 'phone'} size={37} /></div><p>{installed ? 'Приложение открыто в отдельном окне. Главная доступна и без сети после первой загрузки.' : 'Открывайте своё поле одним нажатием — с отдельной иконки, без адресной строки браузера.'}</p>{!installed && <>
    <ol className="install-steps">{ios ? <><li><span>Откройте EGIN в Safari.</span></li><li><span>Нажмите «Поделиться» <Icon name="share" size={15} /> в меню браузера.</span></li><li><span>Выберите «На экран “Домой”» и нажмите «Добавить».</span></li></> : <><li><span>Откройте EGIN в Chrome на телефоне.</span></li><li><span>В меню браузера выберите «Добавить на главный экран» или «Установить приложение».</span></li><li><span>Подтвердите установку. Иконка EGIN появится среди приложений.</span></li></>}</ol>
    {available && <button className="primary-button" disabled={busy} onClick={() => void install()}><Icon name="phone" size={18} />{busy ? 'Устанавливаем…' : 'Установить EGIN'}</button>}
    {error && <p role="alert">{error}</p>}
    {!window.isSecureContext && <div className="source-note"><Icon name="info" size={16} />Для установки откройте сайт по HTTPS через ваш домен.</div>}
  </>}{installed && <button className="primary-button" onClick={onClose}>К моему полю<Icon name="right" size={18} /></button>}</Sheet>;
}
