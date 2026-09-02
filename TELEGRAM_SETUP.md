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
│              API REST (Vercel)                  │
├─────────────────────────────────────────────────┤
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
- **URL:** `https://tu-proyecto.vercel.app`

⚠️ La URL debe ser tu dominio de Vercel o tu servidor

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

# URL de tu Mini App (cuando hagas deploy a Vercel)
MINI_APP_URL=https://tu-proyecto.vercel.app
```

---

## PASO 5: Desplegar a Vercel

### 5.1 Conectar GitHub a Vercel

1. Ir a https://vercel.com
2. Hacer login con GitHub
3. Seleccionar repositorio `secretario_bot`
4. Vercel detectará automáticamente que es un proyecto Node.js

### 5.2 Configurar Variables de Entorno

En Vercel dashboard:
1. Ir a **Settings**
2. Ir a **Environment Variables**
3. Añadir:
   - `BOT_TOKEN`
   - `OWNER_ID`
   - `DATABASE_URL`
   - `MINI_APP_URL`

### 5.3 Deploy

Vercel hará deploy automático en cada push a main.

URL de tu Mini App:
```
https://secretario-bot.vercel.app
```

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

- **Termux (Android):** ver [TERMUX.md](TERMUX.md) — wake lock,
  arranque automático y consumo de batería
- **Tu ordenador:** durante el desarrollo
- **Un servidor 24/7:** Railway, Render, Fly.io

⚠️ El bot necesita un proceso vivo permanentemente, por eso no va
en Vercel: allí solo vive la API y la Mini App.

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
# Obtener tareas
curl -H "x-telegram-init-data: $(tg_init_data)" \
     https://tu-proyecto.vercel.app/api/tasks

# Crear tarea
curl -X POST \
     -H "x-telegram-init-data: $(tg_init_data)" \
     -H "Content-Type: application/json" \
     -d '{"title":"Test","due_at":null}' \
     https://tu-proyecto.vercel.app/api/tasks
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
8. Bot detecta recordatorios vencidos (cada 5 segundos)
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

- [ ] Verificar URL en @BotFather coincide con Vercel
- [ ] Verificar que la API está respondiendo: `curl https://tu-proyecto.vercel.app/api/health`
- [ ] Abrir DevTools en el navegador de Telegram

### Las tareas no se guardan

- [ ] Verificar que `DATABASE_URL` es válido
- [ ] Verificar que la base de datos está creada
- [ ] Ver logs de Vercel

### Recordatorios no se envían

- [ ] El bot debe estar ejecutándose 24/7
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
database.js                   - Acceso a PostgreSQL desde el bot
database-json.js              - Versión antigua en archivo local (respaldo)
api/index.js                  - API REST (en Vercel)
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
vercel.json                   - Configuración de Vercel
```

⚠️ **`DATABASE_URL` debe ser idéntico en `.env` y en Vercel.** Es lo
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
