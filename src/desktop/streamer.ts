/* Режим стрімера (Налаштування → Основне): плашку показують глядачам, тож у ній не має бути нічого особистого —
   ніка, імені в Discord, аватара, імен персонажів і статіків. Гроші сеансу ховає смужка (desktop/src/strip.html),
   кабінет — заслінка в Bar.tsx. Тут лише підміна підписів: одна чиста функція, щоб нічого не пропустити. */
export interface Who { name: string; avatar: string | null; nick: string; nickChangedAt: string | null }
export interface Char { id: string; name: string; static: number | null }

export const STREAM_NICK = 'Гравець';
export function streamView<U extends Who>(user: U | null, characters: Char[], on: boolean): { user: U | null; characters: Char[] } {
  if (!on) return { user, characters };
  return {
    user: user ? { ...user, name: STREAM_NICK, nick: STREAM_NICK, avatar: null } : null,
    characters: characters.map((c, i) => ({ id: c.id, name: `Персонаж ${i + 1}`, static: null })),
  };
}
