import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { fmt } from '../../lib/format';
import { adminError, compareVersions, day, fetchLatestRelease } from '../../lib/admin';
import AdminSection from './AdminSection';

/* Стан програми (specs/039 US3): хто зараз у програмі, на яких версіях, ШІ-помічник за день, завантаження.
   Остання версія — з релізу desktop-latest на GitHub; не відповів — позначки «остання» просто немає */
type Stats = {
  online_3m: number; online_24h: number;
  versions: { version: string | null; n: number }[];
  ai: { requests: number; users: number; capped: number; limit: number };
  downloads: { n: number; since: string } | null;
};

export default function AdminAppState() {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState('');
  const [latest, setLatest] = useState<string | null>(null);
  const load = () => {
    setErr('');
    supabase!.rpc('admin_app_stats').then(({ data, error }) => { if (error) setErr(adminError(error)); else setS(data as Stats); });
  };
  useEffect(() => { load(); fetchLatestRelease().then(setLatest); }, []);

  const vs = [...(s?.versions || [])].sort((a, b) => compareVersions(a.version, b.version));
  const week = vs.reduce((a, v) => a + v.n, 0);
  const onLatest = latest ? vs.find(v => v.version === latest)?.n || 0 : null;
  return (
    <AdminSection title="Стан програми" loading={!s && !err} error={err} onRetry={load}
      actions={<button type="button" className="btn ghost sm" onClick={load}>Оновити</button>}
      hint="Чи дійшла нова збірка до гравців і чи не застрягли вони на старій. Версію передають збірки, новіші за цю панель.">
      {s && <>
        <div className="adm-grid">
          <Tile label="Зараз у програмі" value={fmt(s.online_3m)} sub="за останні 3 хвилини" />
          <Tile label="За добу" value={fmt(s.online_24h)} sub="запускали програму" />
          <Tile label="ШІ-помічник сьогодні" value={fmt(s.ai.requests)} sub={`${fmt(s.ai.users)} гравців · ${fmt(s.ai.capped)} вичерпали ліміт ${s.ai.limit}`} />
          <Tile label="Завантажень програми" value={fmt(s.downloads?.n ?? 0)} sub={s.downloads ? `з ${day(s.downloads.since)}` : 'лічильника ще немає'} />
        </div>
        <h3 className="adm-h3">Версії за 7 днів</h3>
        {latest && onLatest !== null && week > 0 && (
          <p className="muted">На останній ({latest}): <b>{onLatest}</b> з {week} — {Math.round((onLatest / week) * 100)}%</p>
        )}
        {vs.length ? (
          <table className="adm-table">
            <thead><tr><th>Версія</th><th>Акаунтів</th></tr></thead>
            <tbody>
              {vs.map(v => (
                <tr key={v.version || 'old'}>
                  <td>{v.version ? <span className="mono">{v.version}</span> : <span className="muted">стара версія (до цієї панелі)</span>}
                    {v.version && v.version === latest && <span className="pill good">остання в релізі</span>}</td>
                  <td className="mono">{v.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="adm-empty">За тиждень програму ніхто не запускав.</p>}
      </>}
    </AdminSection>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="adm-tile"><span className="muted">{label}</span><b className="mono">{value}</b><small className="muted">{sub}</small></div>;
}
