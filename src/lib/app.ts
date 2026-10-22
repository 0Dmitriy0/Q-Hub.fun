/* Міст до програми Q-Hub Desktop (desktop/src/preload.cjs). Є лише тоді, коли сайт відкрито всередині програми:
   там кабінет можна редагувати, на сайті в браузері — тільки переглядати. */
export interface AppTokens { access_token: string; refresh_token: string; character: string | null }
interface Bridge {
  session: () => Promise<AppTokens | null>;
  onSession: (cb: (t: AppTokens | null) => void) => void;
  logout: () => Promise<unknown>;
  character: (id: string) => Promise<unknown>;
}

export const desktop: Bridge | undefined = typeof window !== 'undefined'
  ? (window as unknown as { qhub?: Bridge }).qhub
  : undefined;

/* редагувати кабінет можна лише з програми */
export const canEdit = !!desktop;
