---
name: desktop-release-packs
description: Програма виходить паками — реліз лише вручну (workflow_dispatch), запис журналу пака з "pending"
metadata:
  type: project
---

З 2026-11-13 злиття в `main` більше не викладає програму гравцям: `.github/workflows/desktop.yml` публікує реліз «desktop-latest» лише при `workflow_dispatch` з `main` (`gh workflow run desktop.yml --ref main`). Пак копиться у верхньому записі `src/data/changelog.json` з `"pending": true`; `src/lib/changelog.ts` ховає його і на сайті, і в програмі, а `deploy.yml` не робить з нього чернетку Discord. Якщо верхній запис ще `pending`, крок у desktop.yml зупиняє реліз.

**Why:** власник хоче випускати оновлення паками, а не по одній функції на кожен PR.

**How to apply:** до змін у програмі — дописувати у верхній `pending`-запис (або створити його). Випускати лише за словом власника: id = дата релізу, прибрати pending, злити, запустити workflow. Після випуску — чернетка Discord з'явиться при наступному деплої сайту (див. [[discord-bot-ops]], [[site-news-sitenews-json]]).
