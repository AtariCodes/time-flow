import { render } from 'preact';
import './styles.css';
import { App } from './components/App';
import { boot } from './state/store';

void boot().then(() => {
  render(<App />, document.getElementById('app')!);
});

if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
