# 📱 Ejecutar el bot en Termux (Android)

## Por qué el bot y la Mini App no se veían

Hasta ahora cada uno guardaba en un sitio distinto:

```
bot.js (Termux)  ──▶  data/database.json   (archivo en tu móvil)
Mini App         ──▶  PostgreSQL en Neon   (la nube)
```

Por eso creabas una tarea en el bot y la Mini App salía vacía: no
era un fallo de la Mini App, es que miraban dos bases de datos
diferentes.

Ahora los dos usan la misma:

```
bot.js (Termux)  ──┐
                   ├──▶  PostgreSQL en Neon
Mini App (Vercel) ─┘
```

Neon viaja por HTTPS, así que desde Termux funciona con datos o
WiFi normales. No hace falta abrir puertos ni montar un túnel.

---

## Puesta en marcha

### 1. Instalar lo necesario

```bash
pkg update && pkg upgrade
pkg install nodejs-lts git
```

### 2. Clonar y preparar

```bash
git clone https://github.com/ylnaud/secretario_bot
cd secretario_bot
npm install
```

### 3. Crear la base de datos

Si aún no tienes una, crea un proyecto gratis en https://neon.tech
y copia la cadena de conexión.

```bash
cp .env.example .env
nano .env
```

Rellena:

```env
BOT_TOKEN=el-token-de-@BotFather
OWNER_ID=tu-id-de-@userinfobot
DATABASE_URL=postgresql://...neon.tech/...?sslmode=require
```

**Importante:** el `DATABASE_URL` tiene que ser **el mismo** que
pusiste en las variables de entorno de Vercel. Si son distintos,
seguirán siendo dos bases de datos separadas.

### 4. Crear las tablas

```bash
npm run init-db
```

Es seguro repetirlo, no borra nada.

### 5. Subir lo que ya tenías

Si llevabas tiempo usando el bot, tus tareas están en
`data/database.json`. Para no perderlas:

```bash
npm run migrate
```

Salta lo que ya exista, así que puedes ejecutarlo varias veces sin
duplicar nada. El archivo original no se toca.

### 6. Arrancar

```bash
npm start
```

Deberías ver:

```
🗄️  Base de datos conectada (usuario #1)
======================================
🤖 SECRETARIO PERSONAL V3 ENCENDIDO
```

Ahora crea una tarea desde el bot y ábrela en la Mini App: debe
aparecer en las dos.

---

## Que no se apague

Android mata procesos en segundo plano. Tres cosas ayudan:

### Wake lock

```bash
pkg install termux-api
termux-wake-lock
```

Mientras esté activo, Android no duerme el proceso. Se libera con
`termux-wake-unlock`.

### Quitar la optimización de batería

Ajustes → Aplicaciones → Termux → Batería → **Sin restricciones**.

Sin esto, Android acaba cerrando Termux aunque tengas wake lock.

### Reinicio automático si se cae

```bash
until npm start; do
  echo "Bot caído, reiniciando en 5s..."
  sleep 5
done
```

Guárdalo como `run.sh`, dale permisos con `chmod +x run.sh` y
arráncalo con `./run.sh`.

### Arrancar al encender el móvil

Instala **Termux:Boot** desde F-Droid y crea el script:

```bash
mkdir -p ~/.termux/boot

cat > ~/.termux/boot/secretario.sh << 'EOF'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
cd ~/secretario_bot
until npm start; do sleep 5; done
EOF

chmod +x ~/.termux/boot/secretario.sh
```

---

## Consumo de datos y batería

El bot comprueba recordatorios cada **30 segundos** (antes eran 5,
pero entonces leía un archivo local; ahora cada comprobación es una
consulta de red).

Son unas 2.900 consultas al día, muy poco tráfico. Si quieres
cambiarlo, en `.env`:

```env
# Más lento: menos batería, el recordatorio puede tardar hasta 1 min
REMINDER_INTERVAL_MS=60000

# Más rápido: más preciso, más consumo
REMINDER_INTERVAL_MS=10000
```

Un recordatorio nunca se pierde por esperar: si el móvil estaba
dormido, se envía en cuanto el proceso vuelve a ejecutarse.

---

## Problemas frecuentes

**`❌ Falta DATABASE_URL en .env`**
No has rellenado el `.env`, o lo has creado fuera de la carpeta del
proyecto. Comprueba con `cat .env`.

**`❌ No se pudo conectar a la base de datos`**
Sin internet, o el `DATABASE_URL` está mal copiado. Prueba
`ping neon.tech`. Ojo con las comillas al pegar la cadena.

**La Mini App sigue vacía**
Casi siempre es que Vercel tiene un `DATABASE_URL` distinto al de
tu `.env`. Compáralos en el panel de Vercel → Settings →
Environment Variables.

**El bot se para al bloquear la pantalla**
Falta el wake lock o la exención de batería. Mira la sección
"Que no se apague".

**`npm install` falla al compilar**
`pkg install python make clang` y reintenta.
