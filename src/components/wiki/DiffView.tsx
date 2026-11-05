import { diffRows, field, show, type Data, type Section } from '../../lib/wiki';

/* «було → стало» поле за полем (specs/043 FR-010); списки — додані й прибрані пункти окремо */
export default function DiffView({ section, old, changes, stale }: { section: Section; old: Data; changes: Data; stale?: boolean }) {
  const rows = diffRows(section, old, changes);
  return (
    <div className="wdiff">
      {stale && <p className="warn wdiff-stale" role="note">Картку змінили після цієї пропозиції — нижче зміни поверх нової версії.</p>}
      {!rows.length && <p className="muted">Змін у полях немає.</p>}
      <dl>
        {rows.map(r => {
          const f = field(section, r.key);
          return (
            <div key={r.key} className="wdiff-row">
              <dt>{r.label}</dt>
              {r.added || r.removed ? (
                <dd>
                  {r.removed!.map((x, i) => <span key={'r' + i} className="wdiff-del">− {x}</span>)}
                  {r.added!.map((x, i) => <span key={'a' + i} className="wdiff-add">+ {x}</span>)}
                  {!r.added!.length && !r.removed!.length && <span className="muted">змінено порядок пунктів</span>}
                </dd>
              ) : (
                <dd><span className="wdiff-del">{show(f, r.before)}</span><span aria-hidden="true"> → </span><span className="sr">стане</span><span className="wdiff-add">{show(f, r.after)}</span></dd>
              )}
            </div>
          );
        })}
      </dl>
    </div>
  );
}
