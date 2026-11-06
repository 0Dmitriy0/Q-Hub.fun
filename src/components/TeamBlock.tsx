import { useEffect, useState } from 'react';
import Icon from './Icon';
import { DiscordMark } from './DiscordMenu';
import { useLinks } from '../lib/brand';
import { supabase } from '../lib/supabase';

/* «Команда Q-Hub» на головній (0062): склад і підписи задає admin (адмінка → «Гравці й ролі»), персонажів — кожен сам
   (Кабінет → Налаштування → персонажі, галочка «Показувати в команді»). Лише нік у Q-Hub; нікого немає — блоку немає */
export type TeamCard = { name: string; avatar_url: string | null; title: string; sort: number; characters: { name: string; static: number | null }[] };

export const sortTeam = (list: TeamCard[]) => [...list].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'uk'));

export default function TeamBlock() {
  const [team, setTeam] = useState<TeamCard[] | null>(null);
  const [{ discord_url }] = useLinks();
  useEffect(() => {
    supabase?.from('team').select('name,avatar_url,title,sort,characters').then(({ data, error }) => setTeam(error ? [] : sortTeam((data as TeamCard[]) || [])));
  }, []);
  if (!team?.length) return null;
  return (
    <section className="h-sec team" aria-labelledby="team-h">
      <div className="h-head"><h2 className="ih" id="team-h"><Icon name="user" />Команда Q-Hub</h2>
        <p className="muted">Люди, які роблять сайт і програму, перевіряють ціни й мітки.</p></div>
      <ul className="team-grid">
        {team.map(m => (
          <li key={m.name} className="card team-card">
            {m.avatar_url ? <img className="team-ava" src={m.avatar_url} alt="" width={56} height={56} loading="lazy" />
              : <span className="team-ava" aria-hidden="true">{(m.name[0] || '?').toUpperCase()}</span>}
            <div className="team-who">
              <b>{m.name}</b>
              {m.title && <span className="team-role">{m.title}</span>}
              {m.characters.length > 0 && (
                <ul className="team-chars" aria-label={`Персонажі ${m.name} у грі`}>
                  {m.characters.map(c => <li key={c.name}>{c.name}{c.static ? <span className="mono muted"> #{c.static}</span> : null}</li>)}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>
      {discord_url && <a className="btn ghost team-join" href={discord_url} target="_blank" rel="noreferrer" data-umami-event="Команда: хочу в команду">
        <DiscordMark size={16} />Хочеш у команду? Пиши в Discord<span className="vh"> (відкриється в новій вкладці)</span></a>}
    </section>
  );
}
