import { Component, type ReactNode } from 'react';
import { Icon } from '../shared/ui/Icon';

export class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="screen-recovery" role="alert"><Icon name="rotate" size={32}/><h1>Не удалось открыть экран</h1><p>Проверьте соединение и перезагрузите страницу. Перезагрузка не очищает сохранённые на телефоне данные.</p><button className="primary-button" onClick={() => location.reload()}>Перезагрузить страницу</button><a href="#/" className="secondary-button">На главную</a></section>;
  }
}
