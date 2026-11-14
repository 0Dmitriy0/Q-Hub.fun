/* Картка сезонного івенту (Хелловін) у першому екрані головної (specs/079). Картку показуємо лише тоді, коли відомо, що
   івент триває: дані з бази або підказка з минулого візиту на цьому пристрої. Без цього (перший візит, ще немає відповіді
   бази) картки немає — інакше вона блимала й зникала, коли івент уже скінчився. */
export type HeroInfo = { ghosts: number; pumpkins: number; ended: boolean };
export type HeroKind = 'ghosts' | 'pumpkins' | 'both';

/* localStorage: тип картки при останньому візиті, коли івент був; немає — не було або ще не знаємо */
export const HERO_HINT_KEY = 'qhub-hero-event';

/* івент триває: дата кінця не минула (або не вказана) і на мапі є привиди чи гарбузи — правило не змінилось */
export const eventOn = (i: HeroInfo) => !i.ended && (i.ghosts > 0 || i.pumpkins > 0);

export const heroKind = (i: HeroInfo): HeroKind => (i.ghosts > 0 && i.pumpkins > 0 ? 'both' : i.pumpkins > 0 && !i.ghosts ? 'pumpkins' : 'ghosts');

/* що показати: дані є — за даними; даних ще немає — за підказкою (або нічого) */
export function heroBanner(info: HeroInfo | null, hint: HeroKind | null): HeroKind | null {
  if (info) return eventOn(info) ? heroKind(info) : null;
  return hint;
}

/* категорії мапи для посилання картки */
export const showParam = (k: HeroKind) => (k === 'both' ? 'pryvydy,harbuzy' : k === 'pumpkins' ? 'harbuzy' : 'pryvydy');

export const parseHint = (raw: string | null): HeroKind | null => (raw === 'ghosts' || raw === 'pumpkins' || raw === 'both' ? raw : null);
