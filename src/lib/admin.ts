/* адмін-панель (specs/039): чиста логіка й спільні дрібниці розділів. Права перевіряє база (0046), тут — лише показ */

/* помилки функцій admin_* → текст для адміна (контракт: contracts/admin-rpc.md) */
export function adminError(e: { code?: string; message?: string } | null | undefined): string {
  if (!e) return '';
  if (e.code === '42501') return 'Немає прав — онови сторінку.';
  if (e.code === 'P0002') return 'Цей рядок уже розібрано.';
  if (e.code === '22023' && e.message) return e.message;
  return 'Не вдалося — спробуй ще.';
}

/* «0.5.110» > «0.5.99»; null (стара збірка без версії) — завжди в кінці */
export function compareVersions(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] || 0) - (pa[i] || 0);
    if (d) return d;
  }
  return 0;
}

/* версія з файлів релізу desktop-latest: інсталятор зветься Q-Hub-Setup-X.Y.Z.exe (старі версії workflow прибирає) */
export function releaseVersion(assets: { name: string }[] | null | undefined): string | null {
  const vs = (assets || []).map(a => /^Q-Hub-Setup-(\d+\.\d+\.\d+)\.exe$/.exec(a.name)?.[1]).filter((v): v is string => !!v);
  return vs.sort(compareVersions)[0] || null;
}

export async function fetchLatestRelease(): Promise<string | null> {
  try {
    const r = await fetch('https://api.github.com/repos/0Dmitriy0/Q-Hub.fun/releases/tags/desktop-latest');
    if (!r.ok) return null;
    return releaseVersion((await r.json()).assets);
  } catch { return null; }
}

/* знімок training/<uid>/<час>.jpg — поруч <час>.json з міткою */
export function shotMeta(name: string): { owner: string; json: string } {
  return { owner: name.split('/')[0], json: name.replace(/\.jpg$/, '.json') };
}

export const OLD_SHOT_DAYS = 90;
export function isOldShot(createdAt: string, now = Date.now()): boolean {
  return now - Date.parse(createdAt) > OLD_SHOT_DAYS * 864e5;
}

export const ROLES = ['user', 'editor', 'moderator', 'admin'] as const;
export const ROLE_NAMES: Record<string, string> = { user: 'гравець', editor: 'редактор', moderator: 'модератор', admin: 'адмін' };

const dt = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv' });
const d = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Kyiv' });
export const when = (s: string | null | undefined) => (s ? dt.format(new Date(s)) : '—');
export const day = (s: string | null | undefined) => (s ? d.format(new Date(s)) : '—');
