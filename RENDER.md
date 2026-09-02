# 🚀 Mover el bot a Render

Para dejar de depender de que el móvil esté encendido.

⚠️ **Antes de nada: para el bot de Termux.** Telegram no
permite dos procesos leyendo los mensajes del mismo bot. Si
dejas los dos, verás errores `409 Conflict` y el bot dejará
de responder de forma intermitente.

```bash
# En Termux
Ctrl+C
```

---

## Pasos

### 1. Crear el servicio

1. Entra en https://render.com y accede con GitHub
2. **New** → **Blueprint**
3. Elige el repositorio `ylnaud/secretario_bot`
4. Render lee `render.yaml` y prepara el servicio solo

### 2. Rellenar las variables

Render te pedirá las tres marcadas como secretas. Cópialas
del `.env` de Termux (`cat .env`):

| Variable | De dónde sale |
|---|---|
| `BOT_TOKEN` | @BotFather |
| `OWNER_ID` | @userinfobot |
| `DATABASE_URL` | La misma de Neon/Vercel |

`DATABASE_URL` tiene que ser **idéntica** a la de Vercel, o el
bot y la Mini App volverán a mirar bases distintas.

### 3. Desplegar

Pulsa **Apply**. El primer despliegue tarda un par de minutos.

En los logs debes ver:

```
🌐 Health check escuchando en el puerto 10000
🗄️  Base de datos conectada (usuario #1)
🤖 SECRETARIO PERSONAL V3 ENCENDIDO
```

Escribe `/start` a tu bot para comprobarlo.

---

## El problema del plan gratuito

**Render duerme los servicios gratuitos tras 15 minutos sin
visitas.** Dormido, el bot no responde y, sobre todo, **no
envía recordatorios**.

Telegram no lo despierta: las llamadas que hace tu bot son
salientes, y Render solo cuenta las entrantes.

Tienes dos salidas.

### Opción A — Ping externo (gratis)

Algo que visite tu URL cada 10 minutos para que no se duerma.

1. Copia la URL del servicio (algo como
   `https://secretario-bot.onrender.com`)
2. Entra en https://cron-job.org (gratis) o UptimeRobot
3. Crea un job que llame a esa URL cada **10 minutos**

El endpoint `/` responde `{"ok":true,...}` justo para esto.

No es perfecto: Render puede dormirlo igualmente si el ping
falla, y consumes horas gratuitas (750 al mes, suficiente
para un servicio).

### Opción B — Background Worker (~7 $/mes)

Es lo correcto para un bot: no duerme nunca y no necesita
puerto ni pings.

Cambia en `render.yaml`:

```yaml
services:
  - type: worker      # en vez de web
    name: secretario-bot
    runtime: node
    plan: starter     # el worker no tiene plan gratuito
```

Y quita la línea `healthCheckPath`.

---

## Comparativa rápida

| | Termux | Render gratis | Render worker |
|---|---|---|---|
| Coste | 0 € | 0 € | ~7 $/mes |
| Depende del móvil | Sí | No | No |
| Se duerme | Solo si Android lo mata | Sí, sin pings | No |
| Recordatorios fiables | Con wake lock | Con ping externo | Sí |

Para uso personal, Termux con wake lock (ver
[TERMUX.md](TERMUX.md)) sale gratis y funciona. Render gratis
con ping va bien si no te importa algún retraso ocasional.

---

## Volver a Termux

Suspende el servicio en Render (**Settings** → **Suspend**)
para que no haya dos procesos, y arranca de nuevo en el móvil:

```bash
npm start
```
