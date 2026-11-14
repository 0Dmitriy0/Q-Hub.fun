import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { payCredits, splitPay, type PayPart, type PayVersion } from '../../lib/payCredits';
import { loadNames } from './PageMeta';

/* Заробіток роботи частинами з підписами (specs/087): хто заміряв, коли й хто з модераторів підтвердив.
   Текст — одразу з картки роботи; підписи — з історії версій довідника (wiki_versions), коли прийдуть.
   Імена — лише з wiki_contributors (як «Додав» / «Останнім оновив»); без бази — просто текст */
const day = (s: string) => {
  const d = new Date(s);
  return d.toLocaleDateString('uk-UA', d.getFullYear() === new Date().getFullYear() ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' });
};

export default function PayBlock({ target, pay }: { target: string; pay: string }) {
  const [parts, setParts] = useState<PayPart[] | null>(null);
  const [names, setNames] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    setParts(null);
    if (!supabase || !target || !pay) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase!.from('wiki_versions').select('version_no,kind,author,decided_by,created_at,data')
        .eq('section', 'job').eq('target_id', target).order('version_no', { ascending: true }).limit(200);
      if (!alive || error || !data) return;
      const vs = (data as (Omit<PayVersion, 'pay'> & { data: { pay?: string } | null })[]).map(v => ({ ...v, pay: v.data?.pay ?? '' }));
      setParts(payCredits(vs, pay));
      loadNames().then(m => { if (alive) setNames(m); });
    })().catch(() => {});
    return () => { alive = false; };
  }, [target, pay]);

  const who = (id: string | null, fallback: string) => (id ? names?.get(id) || fallback : fallback);
  const credit = (p: PayPart) => {
    if (p.kind === 'seed') return 'З початкових даних довідника';
    if (p.kind === 'proposal') return `Заміряв ${who(p.by, 'гравець')}${p.at ? ' · ' + day(p.at) : ''}${p.approvedBy ? ' · підтвердив ' + who(p.approvedBy, 'модератор') : ''}`;
    if (p.kind === 'admin') return `Додав ${who(p.by, 'модератор')}${p.at ? ' · ' + day(p.at) : ''}`;
    return '';
  };
  const byText = new Map((parts ?? []).map(p => [p.text, p]));
  return (
    <ul className="jd-pay">
      {splitPay(pay).map((text, i) => {
        const p = byText.get(text), c = p ? credit(p) : '';
        return <li key={i} className="jd-pay-part">
          <span className="jd-text">{text}</span>
          {p && (c || p.stale) && <small className="jd-pay-by">
            {c}{p.stale && <span className="jd-pay-stale">давно не перевіряли — заміряй таймером Q-Hub і запропонуй свіжу</span>}
          </small>}
        </li>;
      })}
    </ul>
  );
}
