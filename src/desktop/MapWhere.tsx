import Icon from '../components/Icon';
import { asset } from '../lib/app';
import { dist, type Near } from '../lib/mapNear';
import type { MapCategory } from '../lib/mapData';

/* «Де я?» у мапі програми (specs/014 US3): кнопка, стан пошуку, причина невдачі й найближчі мітки увімкнених категорій.
   Позначку «Ти тут» на самій мапі малює MapPage */
export type Where = { state: 'busy' } | { ok: true; x: number; y: number } | { ok: false; why: string } | null;

export default function MapWhere({ where, run, near, catById, pick }: {
  where: Where; run: () => void; near: Near[]; catById: Record<string, MapCategory>; pick: (n: Near) => void;
}) {
  const busy = !!where && 'state' in where;
  return (
    <div className="hud mwhere">
      <button type="button" className="mwhere-b" onClick={run} disabled={busy} title="Відкрий у грі велику карту (50–1500 м) і натисни">
        <Icon name="pin" size={16} />{busy ? 'Шукаю тебе на карті…' : 'Де я?'}
      </button>
      {where && 'ok' in where && !where.ok && <p className="mwhere-no">Не вдалося визначити ({where.why}). Відкрий велику карту гри й спробуй ще.</p>}
      {where && 'ok' in where && where.ok && (near.length
        ? <ul className="mwhere-list" aria-label="Найближчі мітки">{near.map(n => {
            const c = catById[n.mark.category];
            return <li key={n.mark.id}><button type="button" onClick={() => pick(n)}>
              <img src={asset(n.mark.icon || c?.icon || '')} alt="" width={18} height={18} />
              <span>{n.mark.name || c?.name}</span><b className="mono">{dist(n.m)}</b></button></li>;
          })}</ul>
        : <p className="mwhere-no">Увімкни категорії в «Фільтрах міток» — тут будуть найближчі.</p>)}
    </div>
  );
}
