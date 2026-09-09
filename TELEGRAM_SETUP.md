# 🤖 Guía de Integración: Bot + Mini App en Telegram

## Visión General

Tu proyecto tiene 3 componentes que deben conectarse:

```
┌─────────────────────────────────────────────────┐
│                  TELEGRAM APP                   │
├─────────────────────────────────────────────────┤
│  • Bot de comandos (/start, /help, etc)         │
│  • Botones de menú (Nueva tarea, Mis tareas...) │
│  • Mini App Web (Telegram WebView)              │
└─────────────────────────────────────────────────┘
          ↓ (Validación)
┌─────────────────────────────────────────────────┐
│        SERVICIO EN RENDER (un solo proceso)     │
├─────────────────────────────────────────────────┤
│  • bot.js            (polling de Telegram)      │
│  • /                 (la Mini App)              │
│  • /api/tasks        (CRUD tareas)              │
│  • /api/shopping     (CRUD compras)             │
│  • /api/reminders    (CRUD recordatorios)       │
│  • Autentica con x-telegram-init-data           │
└─────────────────────────────────────────────────┘
          ↓ (Lectura/Escritura)
┌─────────────────────────────────────────────────┐
│         BASE DE DATOS PostgreSQL                │
├─────────────────────────────────────────────────┤
│  • Tareas, Compras, Recordatorios               │
│  • Usuarios y sesiones                          │
└─────────────────────────────────────────────────┘
```

El bot y la Mini App comparten proceso y dominio, así que no hay
CORS que configurar ni dos despliegues que mantener.

---

## PASO 1: Crear Bot en Telegram

### 1.1 Abrir @BotFather

1. En Telegram, busca y abre **@BotFather**
2. Escribe `/newbot`
3. Elige un nombre: **Secretario Personal**
4. Elige un username: **secretario_bot_tuname** (debe ser único)

### 1.2 Guardar el Token

BotFather te dará un token como:

```
7123456789:ABCDEFGHijklmnopqrstuvwxyz_1a2b3c4d5e6f7g8h9i0j
```

**⚠️ COPIA Y GUARDA ESTE TOKEN** - lo necesitarás para `BOT_TOKEN` en `.env`

---

## PASO 2: Obtener tu User ID

### 2.1 Abrir @userinfobot

1. En Telegram, busca y abre **@userinfobot**
2. Escribe `/start`
3. Recibirás un mensaje con tu User ID (número)

**⚠️ COPIA Y GUARDA ESTE ID** - lo necesitarás para `OWNER_ID` en `.env`

Ejemplo:
```
Your user id is: 987654321
Your first name: Pedro
```

---

## PASO 3: Registrar la Mini App

### 3.1 En @BotFather

1. Abre **@BotFather**
2. Escribe `/mybots`
3. Selecciona tu bot: **Secretario Personal**
4. Selecciona **Bot Settings**
5. Selecciona **Menu Button**

### 3.2 Configurar el Botón

- **Label (Texto del botón):** `Abrir Secretario`
- **URL:** `https://tu-servicio.onrender.com`

⚠️ La URL es la del servicio de Render (PASO 5). Telegram solo abre
miniaplicaciones por `https`, así que una dirección local no vale.

Resultado:
- El bot tendrá un botón debajo del chat que abre tu Mini App
- La Mini App se carga en un WebView de Telegram

---

## PASO 4: Configurar Variables de Entorno

### 4.1 Crear archivo `.env`

```bash
cp .env.example .env
```

### 4.2 Editar `.env`

```env
# Bot Token de @BotFather
BOT_TOKEN=7123456789:ABCDEFGHijklmnopqrstuvwxyz_1a2b3c4d5e6f7g8h9i0j

# Tu User ID de @userinfobot
OWNER_ID=987654321

# URL de tu base de datos PostgreSQL
# Opciones recomendadas:
# - Neon: https://neon.tech (gratuito, 1 proyecto)
# - Supabase: https://supabase.com (gratuito)
# - Railway: https://railway.app (pago)
DATABASE_URL=postgresql://user:password@host:5432/secretario?sslmode=require

# URL de tu Mini App. En Render NO hace falta: el bot usa
# RENDER_EXTERNAL_URL, que Render publica solo.
MINI_APP_URL=https://tu-servicio.onrender.com
```

---

## PASO 5: Desplegar en Render

Guía detallada (incluido el plan gratuito y sus pegas):
[RENDER.md](RENDER.md). En resumen:

### 5.1 Crear el servicio

1. Ir a https://render.com y acceder con GitHub
2. **New** → **Blueprint**
3. Elegir el repositorio `secretario_bot`
4. Render lee `render.yaml` y prepara el servicio solo

### 5.2 Configurar Variables de Entorno

Render pedirá las tres marcadas como secretas en `render.yaml`:

- `BOT_TOKEN`
- `OWNER_ID`
- `DATABASE_URL`

`TIMEZONE` y `REMINDER_INTERVAL_MS` ya vienen con valor en
`render.yaml`. `MINI_APP_URL` no hace falta.

### 5.3 Deploy

**Apply**. Render vuelve a desplegar en cada push a `main`.

URL del servicio, que sirve el bot, la Mini App y la API:
```
https://secretario-bot.onrender.com
```

⚠️ Si el bot ya está corriendo en Termux, párralo antes: Telegram no
permite dos procesos leyendo los mismos mensajes (error `409 Conflict`).

---

## PASO 6: Ejecutar el Bot

### 6.1 Crear las tablas (solo la primera vez)

```bash
npm install
npm run init-db
```

Si ya venías usando el bot con la base de datos local en JSON,
sube esos datos con:

```bash
npm run migrate
```

### 6.2 Arrancar

```bash
npm start
```

El bot estará escuchando comandos de Telegram.

### 6.3 Dónde ejecutarlo

- **Render:** el despliegue habitual, ver [RENDER.md](RENDER.md).
  `npm start` arranca el bot y, como Render define `PORT`, también el
  servidor web con la Mini App y la API
- **Termux (Android):** ver [TERMUX.md](TERMUX.md) — wake lock,
  arranque automático y consumo de batería
- **Tu ordenador:** durante el desarrollo

⚠️ El bot necesita un proceso vivo permanentemente, así que no vale un
alojamiento sin servidor. Y solo uno a la vez: dos procesos con el
mismo `BOT_TOKEN` dan `409 Conflict`.

---

## PASO 7: Probar la Integración

### 7.1 Probar Bot

1. Abre tu bot en Telegram
2. Escribe `/start` → debe saludar y mostrar menú
3. Prueba `/help` → muestra comandos disponibles
4. Prueba `/id` → muestra tu ID
5. Crea una tarea con **➕ Nueva tarea**

### 7.2 Probar Mini App

1. En tu bot, debería haber un botón **"Abrir Secretario"**
2. Haz click → se abre la Mini App
3. Crea una tarea desde la Mini App
4. Vuelve al bot con **/start** → verás la tarea creada

### 7.3 Probar API Directa

```bash
# Comprobar que el servicio vive (no necesita credenciales)
curl https://tu-servicio.onrender.com/api/health

# Obtener tareas
curl -H "x-telegram-init-data: $(tg_init_data)" \
     https://tu-servicio.onrender.com/api/tasks

# Crear tarea
curl -X POST \
     -H "x-telegram-init-data: $(tg_init_data)" \
     -H "Content-Type: application/json" \
     -d '{"title":"Test","due_at":null}' \
     https://tu-servicio.onrender.com/api/tasks
```

---

## Flujo Completo de Uso

```
1. Usuario abre Telegram
   ↓
2. Ve el botón "Abrir Secretario" en su bot
   ↓
3. Hace click → Se abre Mini App en WebView
   ↓
4. Mini App se conecta a la API con validación de Telegram
   ↓
5. Mini App carga tareas de la base de datos
   ↓
6. Usuario crea/edita tareas en la Mini App
   ↓
7. API guarda cambios en PostgreSQL
   ↓
8. Bot detecta recordatorios vencidos (cada REMINDER_INTERVAL_MS:
   30 s por defecto, 15 s en Render)
   ↓
9. Bot envía notificación automática al usuario
   ↓
10. Usuario puede completar desde el bot o desde la Mini App
```

---

## Troubleshooting

### El bot no responde

- [ ] Verificar que `BOT_TOKEN` es correcto
- [ ] Verificar que `OWNER_ID` es correcto
- [ ] Ver logs: `npm start`

### La Mini App no carga

- [ ] Verificar que la URL en @BotFather coincide con la de Render
- [ ] Verificar que la API está respondiendo: `curl https://tu-servicio.onrender.com/api/health`
- [ ] Abrir DevTools en el navegador de Telegram

### Las tareas no se guardan

- [ ] Verificar que `DATABASE_URL` es válido
- [ ] Verificar que la base de datos está creada
- [ ] Ver los logs del servicio en Render

### Recordatorios no se envían

- [ ] El bot debe estar ejecutándose 24/7
- [ ] En el plan gratuito de Render el servicio se duerme a los 15
      minutos sin visitas: ver [RENDER.md](RENDER.md)
- [ ] Verificar que `OWNER_ID` es el tuyo
- [ ] Ver logs del bot

---

## Comandos Disponibles

```
/start              - Iniciar y ver menú
/help               - Ver lista de comandos
/id                 - Ver tu ID de usuario
➕ Nueva tarea      - Crear una tarea
📋 Mis tareas       - Ver todas las tareas
⏰ Recordatorio     - Crear recordatorio con fecha/hora
🛒 Compras          - Ver lista de compras
➕ Compra           - Añadir producto a compras
📊 Resumen          - Ver estadísticas
🏠 Inicio           - Volver al menú principal
```

---

## Archivos Clave

```
.env                          - Variables de entorno (NO commitear)
bot.js                        - Bot de Telegram (proceso 24/7)
server.js                     - Sirve la Mini App, la API y /health
database.js                   - Acceso a PostgreSQL desde el bot
api/index.js                  - API REST
miniapp/                      - Mini App (HTML + JS + CSS)
  ├── index.html             - Interfaz
  ├── app.js                 - Lógica + conexión con API
  └── style.css              - Estilos
db/schema.sql                 - Tablas de PostgreSQL
lib/db.js                     - Conexión a Neon
lib/telegram.js               - Validación del initData de Telegram
scripts/init-db.js            - Crea las tablas
scripts/migrate-json-to-pg.js - Sube los datos locales a PostgreSQL
package.json                  - Dependencias
render.yaml                   - Configuración de Render (Blueprint)
vercel.json                   - Del despliegue anterior en Vercel
```

⚠️ **`DATABASE_URL` debe ser idéntico en `.env` y en Render.** Es lo
que hace que el bot y la Mini App vean las mismas tareas.

---

## Siguientes Pasos (Opcional)

- [ ] Tareas recurrentes (cada día, cada semana)
- [ ] Resumen diario automático
- [ ] Exportar datos (JSON, CSV)
- [ ] Dark mode en Mini App
- [ ] Categorías de tareas
- [ ] Notas/descripción en tareas
- [ ] Sincronización en tiempo real con WebSockets

---

¿Tienes alguna pregunta sobre la integración?
