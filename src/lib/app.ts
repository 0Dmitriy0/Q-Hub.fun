/* Міст до програми Q-Hub Desktop (desktop/src/preload.cjs). Є лише тоді, коли сайт відкрито всередині програми:
   там кабінет можна редагувати, на сайті в браузері — тільки переглядати. */
export interface AppTokens { access_token: string; refresh_token: string; character: string | null }
interface Bridge {
  session: () => Promise<AppTokens | null>;
  onSession: (cb: (t: AppTokens | null) => void) => void;
  logout: () => Promise<unknown>;
  character: (id: string) => Promise<unknown>;
  onChanged?: (cb: () => void) => () => void;
  openBar?: () => Promise<string>;
  hotkey?: () => Promise<string | null>;
  /* сторінка сайту в браузері */
  site?: (path: string) => Promise<unknown>;
  updateState?: () => Promise<UpdateState | null>;
  updateInstall?: () => Promise<unknown>;
  onUpdate?: (cb: (s: UpdateState) => void) => () => void;
}
/* оновлення програми (desktop/src/updater.cjs); current — встановлена версія */
export interface UpdateState { status: 'idle' | 'available' | 'downloading' | 'ready'; version: string | null; percent: number; error: string | null; current?: string }

export const desktop: Bridge | undefined = typeof window !== 'undefined'
  ? (window as unknown as { qhub?: Bridge }).qhub
  : undefined;

/* редагувати кабінет можна лише з програми */
export const canEdit = !!desktop;

/* картинки каталогу записані в базі як шляхи сайту («/icons/…»); програма відкривається з диска й має їх у себе (ui/icons) */
export const asset = (u: string) => (u.startsWith('/') && typeof location !== 'undefined' && location.protocol === 'file:' ? '.' + u : u);
