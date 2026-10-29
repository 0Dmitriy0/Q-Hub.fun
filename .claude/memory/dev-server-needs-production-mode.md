---
name: dev-server-needs-production-mode
description: "`npm run dev` сайту йде без Supabase — запускати `npx.cmd vite --mode production`"
metadata:
  node_type: memory
  type: project
  originSessionId: 09224dac-b40e-4d1d-9226-5e392daa0edc
  modified: 2026-10-27T15:53:56.047Z
---

У репо є лише `.env.production` (URL і publishable-ключ Supabase), `.env` немає. Тому `npm.cmd run dev` запускає сайт без бази: на мапі нема зон/міток з бази, нема входу й адмін-інструментів — користувач бачить «нічого немає».

**Why:** 2026-10-27 користувач тестував правку зон на localhost і нічого не побачив саме через це.
**How to apply:** для перевірки на localhost запускати `npx.cmd vite --mode production` і попереджати, що це жива база — збереження там одразу видно на сайті.
