import { Fragment } from 'react';
import type { Body } from '../../../supabase/functions/discord-bot/discord';

/* перегляд повідомлення бота так, як його покаже Discord (specs/060 T025): темне тло незалежно від теми сайту,
   смуга кольору embed ліворуч, заголовок-посилання, опис з **жирним**, картинка, footer.
   Без dangerouslySetInnerHTML — жирний розбирається у вузли */
function Md({ text }: { text: string }) {
  return <>{text.split('\n').map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {line.split(/(\*\*[^*]+\*\*)/g).map((p, j) => (p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <b key={j}>{p.slice(2, -2)}</b> : p))}
    </Fragment>
  ))}</>;
}

export default function DiscordPreview({ body }: { body: Body }) {
  return (
    <div className="dcp" aria-label="Як виглядатиме в Discord">
      <div className="dcp-ava" aria-hidden="true">Q</div>
      <div className="dcp-main">
        <div className="dcp-who"><b>Q-Hub</b><span className="dcp-bot">БОТ</span></div>
        {body.content && <p className="dcp-content"><Md text={body.content} /></p>}
        {(body.embeds ?? []).map((e, i) => (
          <div key={i} className="dcp-embed" style={{ borderLeftColor: '#' + (e.color ?? 0x202225).toString(16).padStart(6, '0') }}>
            {e.title && <p className="dcp-title">{e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</a> : e.title}</p>}
            {e.description && <p className="dcp-desc"><Md text={e.description} /></p>}
            {e.image && <img className="dcp-img" src={e.image.url} alt="" loading="lazy" />}
            {e.footer && <p className="dcp-foot">{e.footer.text}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
