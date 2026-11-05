import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

/* автор і остання зміна картки (specs/043 FR-016): «Додав», «Останнім оновив», «Нове» / «Оновлено» 7 днів.
   Імена — з wiki_contributors (лише ті, чиї правки прийнято; профілі гравців база не віддає) */
let names: Promise<Map<string, string>> | null = null;
function loadNames() {
  if (!names) names = supabase
    ? Promise.resolve(supabase.from('wiki_contributors').select('id,name')).then(({ data }) => new Map(((data ?? []) as { id: string; name: string }[]).map(r => [r.id, r.name])))
    : Promise.resolve(new Map());
  return names;
}
export const resetNames = () => { names = null; };

const WEEK = 7 * 86_400_000;
const day = (s: string) => new Date(s).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });

export default function PageMeta({ createdBy, updatedBy, createdAt, updatedAt, version }: {
  createdBy?: string | null; updatedBy?: string | null; createdAt?: string; updatedAt?: string | null; version?: number;
}) {
  const [map, setMap] = useState<Map<string, string> | null>(null);
  useEffect(() => { if (createdBy || updatedBy) loadNames().then(setMap); }, [createdBy, updatedBy]);
  const who = (id?: string | null) => (id ? map?.get(id) || 'гравець' : '');
  const now = Date.now();
  const isNew = createdBy && createdAt && now - new Date(createdAt).getTime() < WEEK;
  const isUpd = !isNew && (version ?? 1) > 1 && updatedAt && now - new Date(updatedAt).getTime() < WEEK;
  if (!createdBy && !updatedBy && !isUpd) return null;
  return (
    <p className="wmeta muted">
      {isNew && <span className="wtag new">Нове</span>}
      {isUpd && <span className="wtag upd">Оновлено {day(updatedAt!)}</span>}
      {createdBy && <span>Додав: <b>{who(createdBy)}</b></span>}
      {updatedBy && (version ?? 1) > 1 && <span>Останнім оновив: <b>{who(updatedBy)}</b>{updatedAt ? ' · ' + day(updatedAt) : ''}</span>}
    </p>
  );
}
