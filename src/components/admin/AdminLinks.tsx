import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useLinks, type LinkKey } from '../../lib/brand';
import Icon from '../Icon';
import DiscordForm, { LINK_TEXT } from '../DiscordForm';
import PromoForm, { type SitePromoRow } from '../PromoForm';
import AdminSection from './AdminSection';
import MoneyRulesForm from './MoneyRulesForm';

/* Переходи й налаштування (specs/039 US5): інструменти, що вже працюють на своїх сторінках, + Discord і промо прямо тут */
const GO: [string, string, string, string][] = [
  ['/admin/pravyla', 'Правила', 'Джерела правил сервера для ШІ-помічника', 'book'],
  ['/mapa?tools=drafts', 'Мапа — чернетки', 'Мітки, які гравці поставили з F9', 'map'],
  ['/mapa/v-gru', 'Інструкція до мапи', 'Як поставити мапу Q-Hub у гру', 'download'],
  ['/#iventy', 'Івенти й промокоди', 'Розклад, сезонні івенти, промокоди сервера', 'clock'],
];
const LINK_KEYS: LinkKey[] = ['discord_url', 'family_url', 'market_url'];

export default function AdminLinks() {
  const [links, reloadLinks] = useLinks();
  const [edit, setEdit] = useState<LinkKey | null>(null);
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
      <AdminSection title="Посилання Discord" hint="Три окремі сервери: сайт Q-Hub, сім'я CORE і торговий майданчик. Порожнє посилання — кнопки немає.">
        <ul className="adm-list">
          {LINK_KEYS.map(k => (
            <li key={k} className="adm-row">
              {edit === k
                ? <DiscordForm field={k} url={links[k]} done={() => { setEdit(null); reloadLinks(); }} />
                : <>
                  <div className="adm-row-main"><b>{LINK_TEXT[k].name}</b><span className="muted">{LINK_TEXT[k].where}</span><span className="mono">{links[k] || 'не задано'}</span></div>
                  <div className="adm-row-act"><button type="button" className="btn ghost sm" onClick={() => setEdit(k)}>Змінити посилання</button></div>
                </>}
            </li>
          ))}
        </ul>
      </AdminSection>
      <AdminSection title="Заробіток у кабінеті" hint="Пороги для «Заробітку» гравців (specs/044).">
        <MoneyRulesForm />
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
