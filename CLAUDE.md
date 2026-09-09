# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# Proyecto: secretario_bot

Bot de Telegram (secretario personal: tareas, recordatorios, lista de la compra)
con Mini App web. Node.js sin framework, sin build, sin tests.

## Despliegue: Render

**Producción corre en Render**, como un único servicio web (`render.yaml`,
rama `main`, plan free, región frankfurt):

- `npm start` → `bot.js`, que arranca el polling de Telegram **y** llama a
  `server.js`.
- `server.js` solo abre puerto si existe `PORT` (lo define Render). En Termux
  no abre nada y el bot funciona igual.
- Un solo dominio sirve las tres cosas, así que no hay CORS que configurar:
  - `/` y estáticos → `miniapp/`
  - `/api/...` → `api/index.js`
  - `/health` → healthCheck de Render

`vercel.json` + `api/index.js` son del despliegue anterior en Vercel. El
handler de `api/index.js` sigue escrito al estilo Vercel (`req.query.path`,
`res.status().json()`) y `server.js` le añade ese envoltorio a mano. **No
reescribas el handler al estilo Node nativo**: rompería el despliegue en
Vercel y no aporta nada.

## Variables de entorno

Definidas en el panel de Render (`sync: false`, nunca en Git). Ver
`.env.example` para el desarrollo local:

- `BOT_TOKEN`, `OWNER_ID`, `DATABASE_URL` → obligatorias, `bot.js` sale con
  error si falta alguna.
- `TIMEZONE` (por defecto `Atlantic/Canary`), `REMINDER_INTERVAL_MS`,
  `MINI_APP_URL`, `PORT`.

## Estructura

| Archivo | Qué hace |
|---|---|
| `bot.js` | Todo el bot: comandos, teclados, bucle de recordatorios, arranque |
| `server.js` | Servidor HTTP: estáticos de la Mini App + API + `/health` |
| `api/index.js` | API REST de la Mini App, autenticada con Telegram `initData` |
| `database.js` | Acceso a datos del bot (traduce `title/completed/name` → `text/done/item`) |
| `lib/db.js` | Conexión Neon (`@neondatabase/serverless`, va por HTTP, no TCP) |
| `lib/telegram.js` | Valida el `initData` de la Mini App (HMAC con `BOT_TOKEN`) |
| `tiempo.js` | Único módulo que sabe de zonas horarias. Distingue "pared" (reloj del usuario) de "instante" (Date guardado) |
| `miniapp/` | Mini App: `index.html`, `app.js`, `style.css`. Sin bundler |
| `db/schema.sql`, `scripts/` | Esquema, `npm run init-db`, `npm run migrate` |

## Reglas del proyecto

- **Fechas**: cualquier cálculo de horas o fechas pasa por `tiempo.js`. No uses
  `new Date()` para interpretar lo que escribe el usuario.
- **Base de datos compartida**: bot y Mini App leen la MISMA base. Un cambio de
  esquema afecta a `database.js` y a `api/index.js` a la vez.
- **Estilo**: comentarios en español explicando el *porqué*, líneas en blanco
  generosas, cabecera de bloque en mayúsculas para separar secciones. Imítalo.
- **Sin tests ni linter**: verifica con `node --check <archivo>` y arranque
  manual, y di explícitamente cuando no puedas comprobar algo.
