import { HOTKEY_GROUPS } from '../lib/hotkeys';

/* комбінації клавіш програми на сайті — сторінка «Програма» й «Інструкція»; у самій програмі — Налаштування → Клавіші */
export default function HotkeysTable() {
  return (
    <div className="p-keys">
      {HOTKEY_GROUPS.map(([g, sub, list]) => (
        <div key={g} className="card">
          <h3>{g}</h3><small className="muted">{sub}</small>
          <dl>{list.map(h => (
            <div key={h.t} className="p-key">
              <dt>{h.key.split('+').map(k => <kbd key={k}>{k}</kbd>)}</dt>
              <dd><b>{h.t}</b><span>{h.d}{h.login ? '. Потрібен вхід у програму' : ''}</span></dd>
            </div>))}</dl>
        </div>))}
    </div>
  );
}
