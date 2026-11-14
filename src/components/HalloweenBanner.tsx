import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { kyivDay } from '../lib/seasons';
import { HERO_HINT_KEY, eventOn, heroBanner, heroKind, parseHint, showParam, type HeroInfo, type HeroKind } from '../lib/halloween';

/* банер Хелловіну на головній (specs/012): привиди й гарбузи на мапі, з кількістю опублікованих міток.
   Гарбузів 0 — лише про привидів (specs/005); жодної — банера немає. Ховається, коли в івенту HALLOWEEN
   є дата кінця і вона минула; без дати кінця — показується.
   Поки дані не прийшли — картки немає (specs/079: інакше блимала, коли івент скінчився), хіба що на цьому пристрої
   минулого разу івент був — тоді картка одразу, без стрибка тексту. Без картки перший екран — на всю ширину (styles.css, :has) */
const plural = (n: number, [one, few, many]: [string, string, string]) =>
  `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many}`;

const readHint = (): HeroKind | null => { try { return parseHint(localStorage.getItem(HERO_HINT_KEY)); } catch { return null; } };

export default function HalloweenBanner() {
  const [info, setInfo] = useState<HeroInfo | null>(null);
  const [hint] = useState(readHint);
  useEffect(() => {
    if (!supabase) return;
    const count = (id: string) => supabase!.from('map_points').select('id', { count: 'exact', head: true }).eq('category_id', id).then(r => r.count || 0);
    const event = supabase.from('season_events').select('ends_on').ilike('title', '%halloween%').order('starts_on', { ascending: false }).limit(1)
      .then(r => (r.data?.[0]?.ends_on as string | null | undefined) ?? null);
    Promise.all([count('pryvydy'), count('harbuzy'), event])
      .then(([ghosts, pumpkins, ends]) => {
        const i = { ghosts, pumpkins, ended: !!ends && ends < kyivDay(Date.now()) };
        setInfo(i);
        /* підказка наступному візиту: був івент — який; не було — прибрати */
        try { if (eventOn(i)) localStorage.setItem(HERO_HINT_KEY, heroKind(i)); else localStorage.removeItem(HERO_HINT_KEY); } catch { /* приватний режим */ }
      })
      .catch(() => { /* без бази — картки немає, підказку не чіпаємо */ });
  }, []);

  const kind = heroBanner(info, hint);
  if (!kind) return null;
  return (
    <Link className="h-promo" to={`/mapa?show=${showParam(kind)}`}>
      <img src="/promo/ghost-tile.webp" alt="" width="700" height="380" fetchPriority="high" />
      <span className="h-promo-body">
        <span className="h-promo-tag">Сезонний івент · HALLOWEEN</span>
        <b>{kind === 'both' ? 'Привиди й гарбузи вже на мапі' : kind === 'pumpkins' ? 'Гарбузи вже на мапі' : 'Карта привидів уже тут'}</b>
        <span>{kind === 'both' ? `${info ? `${plural(info.ghosts, ['привид', 'привиди', 'привидів'])} і ${plural(info.pumpkins, ['гарбуз', 'гарбузи', 'гарбузів'])}` : 'Привиди й гарбузи'} Хелловіну на Quant RP — усі на мапі Q-Hub.`
          : kind === 'pumpkins' ? `${info ? plural(info.pumpkins, ['гарбуз', 'гарбузи', 'гарбузів']) : 'Гарбузи'} Хелловіну на Quant RP — усі на мапі Q-Hub.`
          : 'Швидко знаходь усіх привидів осіннього оновлення Quant RP.'}</span>
        <span className="h-promo-go">Відкрити мапу →</span>
      </span>
    </Link>
  );
}
