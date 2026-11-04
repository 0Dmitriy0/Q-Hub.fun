import type { ReactNode } from 'react';

/* розділ адмін-панелі (specs/039 FR-024): свій заголовок, стан «вантажу» й помилка з повтором — решта панелі працює */
export default function AdminSection({ title, hint, loading, error, onRetry, actions, children }: {
  title: string; hint?: string; loading?: boolean; error?: string; onRetry?: () => void; actions?: ReactNode; children?: ReactNode;
}) {
  return (
    <section className="adm-sec" aria-labelledby={'adm-' + title} aria-busy={loading || undefined}>
      <header className="adm-sec-h">
        <div><h2 id={'adm-' + title}>{title}</h2>{hint && <p className="muted">{hint}</p>}</div>
        {actions}
      </header>
      {error
        ? <div className="adm-err" role="alert"><span>{error}</span>{onRetry && <button type="button" className="btn ghost sm" onClick={onRetry}>Спробувати ще</button>}</div>
        : loading ? <p className="muted adm-loading">Вантажу…</p> : children}
    </section>
  );
}
