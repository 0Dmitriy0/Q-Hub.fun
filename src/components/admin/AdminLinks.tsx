import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useDiscord } from '../../lib/brand';
import Icon from '../Icon';
import DiscordForm from '../DiscordForm';
import PromoForm, { type SitePromoRow } from '../PromoForm';
import AdminSection from './AdminSection';

/* Переходи й налаштування (specs/039 US5): інструменти, що вже працюють на своїх сторінках, + Discord і промо прямо тут */
const GO: [string, string, string, string][] = [
  ['/admin/pravyla', 'Правила', 'Джерела правил сервера для ШІ-помічника', 'book'],
  ['/mapa?tools=drafts', 'Мапа — чернетки', 'Мітки, які гравці поставили з F9', 'map'],
  ['/mapa/v-gru', 'Інструкція до мапи', 'Як поставити мапу Q-Hub у гру', 'download'],
  ['/#iventy', 'Івенти й промокоди', 'Розклад, сезонні івенти, промокоди сервера', 'clock'],
];

export default function AdminLinks() {
  const [discord, reloadDiscord] = useDiscord();
  const [editDiscord, setEditDiscord] = useState(false);
  const [promo, setPromo] = useState<SitePromoRow | null>(null);
  const [editPromo, setEditPromo] = useState(false);
  const loadPromo = () => { supabase!.from('site_promo').select('code,reward,note,enabled').maybeSingle().then(({ data }) => setPromo(data as SitePromoRow | null)); };
  useEffect(loadPromo, []);

  return (
    <>
      <AdminSection title="Інструменти" hint="Те, що працює на своїх сторінках.">
        <ul className="adm-go">
          {GO.map(([to, t, sub, ico]) => (
            <li key={to}><Link to={to}><Icon name={ico} size={18} /><span><b>{t}</b><small className="muted">{sub}</small></span></Link></li>
          ))}
        </ul>
      </AdminSection>
      <AdminSection title="Discord Q-Hub" hint="Одне посилання для підвалу, сторінки «Програма», інструкції до мапи й програми.">
        {editDiscord
          ? <DiscordForm url={discord} done={() => { setEditDiscord(false); reloadDiscord(); }} />
          : <div className="row adm-line"><span className="mono">{discord || 'не задано — кнопок Discord ніде немає'}</span><button type="button" className="btn ghost sm" onClick={() => setEditDiscord(true)}>Змінити посилання</button></div>}
      </AdminSection>
      <AdminSection title="Промокод Q-Hub" hint="Блок на першому екрані головної.">
        {editPromo
          ? <PromoForm p={promo || { code: 'QHUB', reward: '', note: '', enabled: true }} done={() => { setEditPromo(false); loadPromo(); }} />
          : <div className="row adm-line">
            <span>{promo ? <><b className="mono">{promo.code}</b> — {promo.reward} <span className={'pill ' + (promo.enabled ? 'good' : 'warn')}>{promo.enabled ? 'показується' : 'вимкнено'}</span></> : 'ще не задано'}</span>
            <button type="button" className="btn ghost sm" onClick={() => setEditPromo(true)}>Змінити промокод</button>
          </div>}
      </AdminSection>
    </>
  );
}
