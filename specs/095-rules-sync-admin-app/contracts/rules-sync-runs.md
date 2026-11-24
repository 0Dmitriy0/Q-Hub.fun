# Contract: журнал спроб і правило workflow

## Читання (програма адміна, сторінка джерел на сайті)

```
select at, via, ok, topics, items, changes, error from rules_sync_runs order by at desc limit 10
select at, via from rules_sync_runs where ok order by at desc limit 1
```

RLS: лише `my_role() = 'admin'`. Інші ролі отримують порожньо.

## Правило workflow `.github/workflows/rules-sync.yml`

```
allErr  = sources.length > 0 && sources.every(s => s.error)
fresh24 = last_ok && (now − last_ok.at) < 24 год
allErr && !fresh24  → ::error:: «Жодне джерело не оновилось, і за 24 год правил не оновлював ніхто — правила застарівають», exit 1
allErr &&  fresh24  → ::notice:: «Форум не пускає сервер; правила оновлено з програми адміна о <час>»
інакше              → як зараз
```
