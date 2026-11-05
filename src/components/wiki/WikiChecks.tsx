import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { dbError, type Section } from '../../lib/wiki';
import Icon from '../Icon';

/* «Актуально» й «Може бути застарілим» (specs/043 US6, 0060): гравець підтверджує, що дані картки правильні —
   один голос з акаунта на версію картки; картка, яку довго не змінювали й не підтверджували, — з позначкою */
let staleDays: Promise<number> | null = null;
const loadStale = () => (staleDays ??= supabase
  ? Promise.resolve(supabase.from('wiki_settings').select('stale_days').maybeSingle()).then(({ data }) => Number(data?.stale_days ?? 30))
  : Promise.resolve(30));
const day = (s: string) => new Date(s).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
const word = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'гравець' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'гравці' : 'гравців');

export default function WikiChecks({ section, target, version, changedAt, onPropose }: {
  section: Section; target: string; version?: number; changedAt?: string | null; onPropose?: () => void;
}) {
  const { session } = useAuth();
  const [n, setN] = useState(0); const [last, setLast] = useState<string | null>(null);
  const [mine, setMine] = useState(false); const [stale, setStale] = useState(30);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [off, setOff] = useState(false);   // лічильника ще немає в базі (0060 не застосовано) — блок не показуємо

  useEffect(() => {
    if (!supabase || version === undefined) return;
    loadStale().then(setStale);
    supabase.from('wiki_check_counts').select('n,last_at').eq('section', section).eq('target_id', target).maybeSingle()
      .then(({ data, error }) => { if (error) { setOff(true); return; } setN(Number(data?.n ?? 0)); setLast(data?.last_at ?? null); });
    if (session) supabase.from('wiki_checks').select('user_id').eq('section', section).eq('target_id', target).eq('version_no', version).eq('user_id', session.user.id).limit(1)
      .then(({ data }) => setMine(!!data?.length));
  }, [section, target, version, session]);

  if (version === undefined || off) return null;
  /* останнє, що підтверджує свіжість: зміна картки чи «Актуально» */
  const fresh = Math.max(changedAt ? new Date(changedAt).getTime() : 0, last ? new Date(last).getTime() : 0);
  const old = fresh > 0 && Date.now() - fresh > stale * 86_400_000;

  async function check() {
    setBusy(true); setMsg('');
    const { data, error } = await supabase!.rpc('wiki_check', { p_section: section, p_target: target });
    setBusy(false);
    if (error) { setMsg(dbError(error)); return; }
    const r = data as { n: number; last_at: string };
    setN(Number(r.n)); setLast(r.last_at); setMine(true);
  }

  return (
    <div className="wcheck">
      {old && <p className="wcheck-old" role="note"><Icon name="alert" size={14} />Може бути застарілим — давно ніхто не підтверджував. Перевір у грі{onPropose ? <> і <button type="button" className="linkish" onClick={onPropose}>запропонуй правку</button></> : ''}.</p>}
      <div className="row">
        {session && (mine
          ? <span className="wtag new"><Icon name="check" size={12} />Ти підтвердив</span>
          : <button type="button" className="btn ghost sm" disabled={busy} onClick={check} title="Перевірив у грі — усе правильно"><Icon name="check" size={14} />Актуально</button>)}
        <small className="muted">{n ? `Підтвердили ${n} ${word(n)}, востаннє ${day(last!)}` : 'Ще ніхто не підтверджував цю версію'}</small>
      </div>
      {msg && <small className="err" role="alert">{msg}</small>}
    </div>
  );
}
