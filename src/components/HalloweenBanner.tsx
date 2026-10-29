import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { kyivDay } from '../lib/seasons';

/* банер Хелловіну на головній (specs/012): привиди й гарбузи на мапі, з кількістю опублікованих міток.
   Гарбузів 0 — лише про привидів (specs/005); жодної — банера немає. Ховається, коли в івенту HALLOWEEN
   є дата кінця і вона минула; без дати кінця — показується. Поки дані не прийшли — текст про привидів, без стрибка */
const plural = (n: number, [one, few, many]: [string, string, string]) =>
  `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many}`;

type Info = { ghosts: number; pumpkins: number; ended: boolean };

export default function HalloweenBanner() {
  const [info, setInfo] = useState<Info | null>(null);
  useEffect(() => {
    if (!supabase) return;
    const count = (id: string) => supabase!.from('map_points').select('id', { count: 'exact', head: true }).eq('category_id', id).then(r => r.count || 0);
    const event = supabase.from('season_events').select('ends_on').ilike('title', '%halloween%').order('starts_on', { ascending: false }).limit(1)
      .then(r => (r.data?.[0]?.ends_on as string | null | undefined) ?? null);
    Promise.all([count('pryvydy'), count('harbuzy'), event])
      .then(([ghosts, pumpkins, ends]) => setInfo({ ghosts, pumpkins, ended: !!ends && ends < kyivDay(Date.now()) }))
      .catch(() => { /* без бази — лишається текст про привидів */ });
  }, []);

  if (info && (info.ended || (!info.ghosts && !info.pumpkins))) return null;
  const both = !!info && info.ghosts > 0 && info.pumpkins > 0;
  const onlyPumpkins = !!info && !info.ghosts && info.pumpkins > 0;
  const show = both ? 'pryvydy,harbuzy' : onlyPumpkins ? 'harbuzy' : 'pryvydy';
  return (
    <Link className="h-promo" to={`/mapa?show=${show}`}>
      <img src="/promo/ghost-tile.webp" alt="" width="700" height="380" fetchPriority="high" />
      <span className="h-promo-body">
        <span className="h-promo-tag">Сезонний івент · HALLOWEEN</span>
        <b>{both ? 'Привиди й гарбузи вже на мапі' : onlyPumpkins ? 'Гарбузи вже на мапі' : 'Карта привидів уже тут'}</b>
        <span>{both ? `${plural(info!.ghosts, ['привид', 'привиди', 'привидів'])} і ${plural(info!.pumpkins, ['гарбуз', 'гарбузи', 'гарбузів'])} Хелловіну на Quant RP — усі на мапі Q-Hub.`
          : onlyPumpkins ? `${plural(info!.pumpkins, ['гарбуз', 'гарбузи', 'гарбузів'])} Хелловіну на Quant RP — усі на мапі Q-Hub.`
          : 'Швидко знаходь усіх привидів осіннього оновлення Quant RP.'}</span>
        <span className="h-promo-go">Відкрити мапу →</span>
      </span>
    </Link>
  );
}
