require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = Number(process.env.OWNER_ID);

/*
   Las variables se validan ANTES de cargar la base de
   datos, porque ./database abre la conexión al importarse
   y así el error se explica en lugar de reventar.
*/

if (!BOT_TOKEN) {
    console.error('❌ Falta BOT_TOKEN en .env');
    process.exit(1);
}

if (!OWNER_ID) {
    console.error('❌ Falta OWNER_ID en .env');
    process.exit(1);
}

if (!process.env.DATABASE_URL) {
    console.error('❌ Falta DATABASE_URL en .env');
    console.error('   El bot y la Mini App comparten esta base de datos.');
    console.error('   Crea una gratis en https://neon.tech');
    process.exit(1);
}

const {
    Telegraf,
    Markup
} = require('telegraf');

const {
    getOwnerUserId,
    addTask,
    scheduleNext,
    stopRecurrence,
    getPendingTasks,
    getDueTasks,
    markNotified,
    completeTask,
    deleteTask,
    addShopping,
    getShopping,
    completeShopping,
    deleteShopping,
    getSummaryConfig,
    setSummaryHour,
    markSummarySent,
    getStats
} = require('./database');

const tiempo = require('./tiempo');

const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 20;

const bot = new Telegraf(BOT_TOKEN);

const sessions = new Map();
const rateLimits = new Map();

function authorized(ctx) {

    return (
        ctx.from &&
        ctx.from.id === OWNER_ID
    );
}

function checkRateLimit(ctx) {

    const userId = ctx.from?.id;

    if (!userId) return false;

    const now = Date.now();

    if (!rateLimits.has(userId)) {
        rateLimits.set(userId, []);
    }

    const userRequests = rateLimits.get(userId);

    const recentRequests = userRequests.filter(
        time => now - time < RATE_LIMIT_WINDOW
    );

    if (recentRequests.length >= RATE_LIMIT_MAX) {
        return false;
    }

    recentRequests.push(now);

    rateLimits.set(userId, recentRequests);

    return true;
}

function sanitizeText(text) {

    if (!text) return '';

    return String(text)
        .trim()
        .slice(0, 500)
        .replace(/[<>]/g, '');
}

function mainMenu() {

    return Markup.keyboard([
        ['📱 Abrir app'],
        ['➕ Nueva tarea', '📋 Mis tareas'],
        ['⏰ Recordatorio', '🛒 Compras'],
        ['➕ Compra', '📊 Resumen'],
        ['☀️ Resumen del día', '❓ Ayuda'],
        ['🏠 Inicio']
    ]).resize();
}

function cancelMenu() {

    return Markup.keyboard([
        ['❌ Cancelar', '🏠 Inicio']
    ]).resize();
}

function formatDate(dateString) {

    return tiempo.formatear(dateString);
}

/*
====================================================
PARSER DE FECHAS NATURALES
====================================================
*/

function normalizeText(text) {

    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[.,]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseTime(text) {

    let match = text.match(
        /\b(?:a\s*las?\s*)?(\d{1,2})(?::(\d{2}))?\s*(?:h|hrs?|horas?)?\b/
    );

    if (!match) {
        return null;
    }

    let hour = Number(match[1]);
    let minute = Number(match[2] || 0);

    if (
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59
    ) {
        return null;
    }

    return {
        hour,
        minute
    };
}


/*
   Devuelve la hora de pared que ha entendido, no un
   instante: quien llame decide cuándo convertirla, y así
   sumar días nunca se descuadra por el cambio de hora.

   Cuando no se dice la hora se usan las 9:00, salvo por la
   tarde y la noche, que van a las 18:00.
*/

function parseNaturalDate(text) {

    const normalized = normalizeText(text);

    const base = tiempo.ahora();

    const time = parseTime(normalized);

    /*
       Los números de la propia fecha no son la hora: en
       "15/03" el 15 es el día, y en "en 3 dias" el 3 son
       días. Cada rama descarta su fragmento antes de
       buscar la hora.
    */

    function horaFuera(fragmento) {

        return parseTime(
            normalized.replace(fragmento, ' ')
        );
    }

    function conHoraOPorDefecto(pared, porDefecto = 9, hora = time) {

        return hora
            ? tiempo.conHora(pared, hora.hour, hora.minute)
            : tiempo.conHora(pared, porDefecto, 0);
    }

    /*
       EN X MINUTOS
    */

    let match = normalized.match(
        /(?:en|dentro de)\s+(\d+)\s+minutos?/
    );

    if (match) {

        return {
            pared: tiempo.sumarMinutos(base, Number(match[1])),
            confidence: 'high'
        };
    }

    /*
       EN X HORAS
    */

    match = normalized.match(
        /(?:en|dentro de)\s+(\d+)\s+horas?/
    );

    if (match) {

        return {
            pared: tiempo.sumarMinutos(base, Number(match[1]) * 60),
            confidence: 'high'
        };
    }

    /*
       EN X DIAS
    */

    match = normalized.match(
        /(?:en|dentro de)\s+(\d+)\s+dias?/
    );

    if (match) {

        const horaReal = horaFuera(match[0]);

        const pared =
            tiempo.sumarDias(base, Number(match[1]));

        /*
           Sin hora, se usan las 9:00 como en el resto: un
           aviso heredaría si no la hora exacta en que se
           escribió, y de madrugada no sirve de nada.
        */

        return {
            pared: conHoraOPorDefecto(pared, 9, horaReal),
            confidence: 'high'
        };
    }

    /*
       MAÑANA
    */

    if (normalized.includes('manana')) {

        return {
            pared: conHoraOPorDefecto(
                tiempo.sumarDias(base, 1)
            ),
            confidence: 'high'
        };
    }

    /*
       HOY
    */

    if (/\bhoy\b/.test(normalized)) {

        if (!time) {
            return null;
        }

        return {
            pared: tiempo.conHora(base, time.hour, time.minute),
            confidence: 'high'
        };
    }

    /*
       ESTA TARDE / ESTA NOCHE
    */

    if (
        normalized.includes('esta tarde') ||
        normalized.includes('esta noche')
    ) {

        let pared = conHoraOPorDefecto(base, 18);

        if (!tiempo.esFutura(pared)) {
            pared = tiempo.sumarDias(pared, 1);
        }

        return {
            pared,
            confidence: 'medium'
        };
    }

    /*
       DIAS DE LA SEMANA
    */

    const weekdays = {
        domingo: 0,
        lunes: 1,
        martes: 2,
        miercoles: 3,
        jueves: 4,
        viernes: 5,
        sabado: 6
    };

    for (const [name, number] of Object.entries(weekdays)) {

        if (normalized.includes(name)) {

            return {
                pared: conHoraOPorDefecto(
                    tiempo.proximoDiaSemana(base, number)
                ),
                confidence: 'high'
            };
        }
    }

    /*
       FECHA DD/MM
    */

    match = normalized.match(
        /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/
    );

    if (match) {

        let pared = conHoraOPorDefecto(
            {
                year: match[3] ? Number(match[3]) : base.year,
                month: Number(match[2]),
                day: Number(match[1]),
                hour: 9,
                minute: 0
            },
            9,
            horaFuera(match[0])
        );

        /*
           Sin año, una fecha ya pasada se entiende como
           la del año que viene.
        */

        if (!match[3] && !tiempo.esFutura(pared)) {

            pared = { ...pared, year: pared.year + 1 };
        }

        return {
            pared,
            confidence: 'high'
        };
    }

    /*
       FORMATO ISO
       2026-09-05 14:30
    */

    match = normalized.match(
        /\b(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?\b/
    );

    if (match) {

        return {
            pared: {
                year: Number(match[1]),
                month: Number(match[2]),
                day: Number(match[3]),
                hour: Number(match[4] || 9),
                minute: Number(match[5] || 0)
            },
            confidence: 'high'
        };
    }

    return null;
}


/*

====================================================
*/

const WEEKDAY_NAMES =
    'domingo|lunes|martes|miercoles|jueves|viernes|sabado';

function parseRecurrence(normalized) {

    if (
        /\b(cada|todos los)\s+dias?\b/.test(normalized) ||
        /\b(diariamente|a diario)\b/.test(normalized)
    ) {
        return 'daily';
    }

    if (
        new RegExp(
            `\\b(cada|todos los)\\s+(${WEEKDAY_NAMES})\\b`
        ).test(normalized) ||
        /\b(cada|todas las)\s+semanas?\b/.test(normalized) ||
        /\bsemanalmente\b/.test(normalized)
    ) {
        return 'weekly';
    }

    if (
        /\b(cada|todos los)\s+mes(es)?\b/.test(normalized) ||
        /\bmensualmente\b/.test(normalized)
    ) {
        return 'monthly';
    }

    return null;
}


function describeRecurrence(recurrence) {

    if (recurrence === 'daily') return 'todos los días';
    if (recurrence === 'weekly') return 'cada semana';
    if (recurrence === 'monthly') return 'cada mes';

    return '';
}


function extractReminder(text) {

    const normalized = normalizeText(text);

    const recurrence = parseRecurrence(normalized);

    let parsed = parseNaturalDate(text);

    /*
       "cada día a las 9" no lleva ninguna fecha, solo una
       hora suelta. Se toma la próxima vez que den esa hora.
    */

    if (!parsed && recurrence) {

        const time = parseTime(normalized);

        let pared = tiempo.conHora(
            tiempo.ahora(),
            time ? time.hour : 9,
            time ? time.minute : 0
        );

        if (!tiempo.esFutura(pared)) {
            pared = tiempo.sumarDias(pared, 1);
        }

        parsed = {
            pared,
            confidence: time ? 'medium' : 'low'
        };
    }

    if (!parsed) {
        return null;
    }

    let cleanText = text;

    cleanText = cleanText
        /*
           Las marcas de repetición se quitan primero: si se
           borrara antes el día suelto, "todos los lunes"
           dejaría un "todos los" huérfano en la tarea.
        */
        .replace(
            new RegExp(
                `\\b(cada|todos\\s+los|todas\\s+las)\\s+` +
                `(d[ií]as?|semanas?|mes(?:es)?|${WEEKDAY_NAMES}|miércoles|sábado)\\b`,
                'gi'
            ),
            ''
        )
        .replace(
            /\b(diariamente|semanalmente|mensualmente|a diario)\b/gi,
            ''
        )
        .replace(
            /recu[eé]rdame/gi,
            ''
        )
        .replace(
            /recordatorio/gi,
            ''
        )
        .replace(
            /en\s+\d+\s+minutos?/gi,
            ''
        )
        .replace(
            /dentro de\s+\d+\s+minutos?/gi,
            ''
        )
        .replace(
            /en\s+\d+\s+horas?/gi,
            ''
        )
        .replace(
            /dentro de\s+\d+\s+horas?/gi,
            ''
        )
        .replace(
            /en\s+\d+\s+dias?/gi,
            ''
        )
        .replace(
            /dentro de\s+\d+\s+dias?/gi,
            ''
        )
        .replace(
            /\bma[ñn]ana\b/gi,
            ''
        )
        .replace(
            /\bhoy\b/gi,
            ''
        )
        .replace(
            /esta\s+tarde/gi,
            ''
        )
        .replace(
            /esta\s+noche/gi,
            ''
        )
        .replace(
            /\bel\s+(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/gi,
            ''
        )
        .replace(
            /\b(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/gi,
            ''
        )
        .replace(
            /\b\d{1,2}\/\d{1,2}(?:\/\d{4})?\b/g,
            ''
        )
        .replace(
            /\b\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?\b/g,
            ''
        )
        .replace(
            /\ba\s*las?\s*\d{1,2}(?::\d{2})?\s*(?:h|hrs?|horas?)?\b/gi,
            ''
        )
        .replace(
            /\ben\s+\d+\s+minutos?/gi,
            ''
        )
        .replace(
            /\ben\s+\d+\s+horas?/gi,
            ''
        )
        .replace(
            /\ben\s+\d+\s+dias?/gi,
            ''
        )
        .replace(
            /\s+/g,
            ' '
        )
        .trim();

    if (!cleanText) {
        cleanText = 'Recordatorio';
    }

    return {
        text: cleanText,
        date: tiempo.aInstante(parsed.pared),
        recurrence
    };
}

bot.use((ctx, next) => {

    if (!checkRateLimit(ctx)) {

        console.warn(
            `⚠️  Rate limit excedido para usuario ${ctx.from?.id}`
        );

        return;
    }

    return next();
});

bot.use((ctx, next) => {

    if (!authorized(ctx)) {

        ctx.reply(
            '⛔ Acceso denegado. Este secretario es privado.'
        ).catch(err => {
            console.error('Error enviando denegación:', err.message);
        });

        return;
    }

    return next();
});

/*
====================================================
COMANDOS
====================================================
*/

/*
====================================================
BOTÓN DE LA MINI APP
====================================================

Render publica su dirección en RENDER_EXTERNAL_URL, así
que el botón funciona sin configurar nada. MINI_APP_URL
permite forzar otra si hiciera falta.

Telegram solo abre miniaplicaciones por https, de modo
que en local (http) el botón no se muestra.
*/

const MINI_APP_URL =
    process.env.MINI_APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    '';

function miniAppButton() {

    if (!MINI_APP_URL.startsWith('https://')) {
        return null;
    }

    return Markup.inlineKeyboard([
        [
            Markup.button.webApp(
                '📱 Abrir Secretario',
                MINI_APP_URL
            )
        ]
    ]);
}


bot.start(async ctx => {

    const taskCount = (await getPendingTasks()).length;
    const shoppingCount = (await getShopping()).length;

    await ctx.reply(
        '🤖 SECRETARIO PERSONAL V3\n\n' +
        '¡Hola! Estoy listo para ayudarte.\n\n' +
        `📊 Estado actual:\n` +
        `📋 Tareas pendientes: ${taskCount}\n` +
        `🛒 Artículos de compra: ${shoppingCount}\n\n` +
        'Escribe /help para ver comandos disponibles.',
        mainMenu()
    );

    const button = miniAppButton();

    if (button) {

        await ctx.reply(
            'Toca aquí para abrir la aplicación:',
            button
        );
    }
});


bot.command('app', async ctx => {

    const button = miniAppButton();

    if (!button) {

        await ctx.reply(
            '⚠️ La aplicación no está publicada todavía.\n\n' +
            'Falta configurar MINI_APP_URL con una dirección https.',
            mainMenu()
        );

        return;
    }

    await ctx.reply(
        '📱 Tu secretario:',
        button
    );
});


bot.command('resumen', async ctx => {

    const argumento =
        (ctx.message.text.split(' ')[1] || '').toLowerCase();

    /*
       Sin argumento se manda el resumen; con uno se
       configura a qué hora llega cada día.
    */

    if (!argumento) {

        await ctx.reply(await buildSummary(), mainMenu());

        return;
    }

    if (argumento === 'off' || argumento === 'no') {

        await setSummaryHour(null);

        await ctx.reply(
            '🔕 Ya no recibirás el resumen diario.\n\n' +
            'Puedes volver a activarlo con /resumen 8',
            mainMenu()
        );

        return;
    }

    const hora = Number(argumento);

    if (!Number.isInteger(hora) || hora < 0 || hora > 23) {

        await ctx.reply(
            '⚠️ Dime una hora entre 0 y 23.\n\n' +
            'Ejemplos:\n' +
            '  /resumen 8   → cada día a las 8\n' +
            '  /resumen off → dejar de recibirlo\n' +
            '  /resumen     → verlo ahora mismo',
            mainMenu()
        );

        return;
    }

    await setSummaryHour(hora);

    /*
       Si la hora de hoy ya pasó, se marca como enviado para
       que no llegue de golpe justo al configurarlo.
    */

    const ahoraPared = tiempo.ahora();

    if (ahoraPared.hour >= hora) {
        await markSummarySent(tiempo.diaTexto(ahoraPared));
    }

    await ctx.reply(
        `☀️ Cada día a las ${hora}:00 te mandaré el resumen.\n\n` +
        (ahoraPared.hour >= hora
            ? 'El primero llegará mañana.'
            : 'El primero llega hoy.'),
        mainMenu()
    );
});


bot.hears('☀️ Resumen del día', async ctx => {

    await ctx.reply(await buildSummary(), mainMenu());
});


bot.hears('📱 Abrir app', async ctx => {

    const button = miniAppButton();

    if (button) {
        await ctx.reply('📱 Tu secretario:', button);
    }
});

const HELP_TEXT =
    '❓ COMANDOS DISPONIBLES\n\n' +
    '📋 Tareas:\n' +
    '  • ➕ Nueva tarea\n' +
    '  • 📋 Mis tareas\n\n' +
    '⏰ Recordatorios:\n' +
    '  • ⏰ Recordatorio\n' +
    '  • Escribe: "Mañana a las 9"\n\n' +
    '🔁 Que se repitan:\n' +
    '  • "Cada día a las 8 dar de comer"\n' +
    '  • "Todos los lunes sacar la basura"\n' +
    '  • "Cada mes pagar el alquiler"\n' +
    '  • Para pararlas, botón 🚫 Dejar de repetir\n\n' +
    '🛒 Compras:\n' +
    '  • 🛒 Compras\n' +
    '  • ➕ Compra\n\n' +
    '☀️ Resumen diario:\n' +
    '  • /resumen - Verlo ahora\n' +
    '  • /resumen 8 - Recibirlo a las 8\n' +
    '  • /resumen off - Dejar de recibirlo\n\n' +
    '📱 Aplicación:\n' +
    '  • 📱 Abrir app\n' +
    '  • /app - Botón para abrirla\n\n' +
    '📊 Otros:\n' +
    '  • /help - Este mensaje\n' +
    '  • /id - Tu ID de usuario\n' +
    '  • 📊 Resumen - Estadísticas\n' +
    '  • 🏠 Inicio - Menú principal';

bot.command('help', async ctx => {

    await ctx.reply(HELP_TEXT, mainMenu());
});

bot.hears('❓ Ayuda', async ctx => {

    await ctx.reply(HELP_TEXT, mainMenu());
});

bot.command('id', async ctx => {

    await ctx.reply(
        `🆔 Tu ID de usuario es:\n\n<code>${ctx.from.id}</code>`,
        {
            parse_mode: 'HTML'
        }
    );
});

bot.hears('🏠 Inicio', async ctx => {

    sessions.delete(ctx.from.id);

    const taskCount = (await getPendingTasks()).length;

    await ctx.reply(
        `🏠 Volviendo al inicio...\n\n` +
        `📋 Tareas pendientes: ${taskCount}`,
        mainMenu()
    );
});

/*
====================================================
NUEVA TAREA
====================================================
*/

bot.hears(
    '➕ Nueva tarea',
    async ctx => {

        sessions.set(
            ctx.from.id,
            {
                type: 'task'
            }
        );

        await ctx.reply(
            '📝 NUEVA TAREA\n\n' +
            '¿Qué tarea quieres guardar?\n\n' +
            'Ejemplos:\n' +
            '• Limpiar la finca\n' +
            '• Llamar al banco\n' +
            '• Comprar café',
            cancelMenu()
        );
    }
);

/*
====================================================
RECORDATORIO
====================================================
*/

bot.hears(
    '⏰ Recordatorio',
    async ctx => {

        if (!authorized(ctx)) return;

        sessions.set(
            ctx.from.id,
            {
                type: 'natural_reminder'
            }
        );

        await ctx.reply(
            '⏰ ESCRIBE TU RECORDATORIO\n\n' +
            'Puedes escribirlo normalmente.\n\n' +
            'Una vez:\n' +
            '• Mañana a las 9 llamar al banco\n' +
            '• En 30 minutos revisar la comida\n' +
            '• El viernes a las 18:30 llevar documentos\n\n' +
            'Que se repita:\n' +
            '• Cada día a las 8 dar de comer a los animales\n' +
            '• Todos los lunes a las 9 sacar la basura\n' +
            '• Cada mes pagar el alquiler',
            cancelMenu()
        );
    }
);

/*
====================================================
MIS TAREAS
====================================================
*/

bot.hears(
    '📋 Mis tareas',
    async ctx => {

        if (!authorized(ctx)) return;

        const tasks =
            await getPendingTasks();

        if (!tasks.length) {

            await ctx.reply(
                '🎉 No tienes tareas pendientes.',
                mainMenu()
            );

            return;
        }

        for (const task of tasks) {

            const buttons = [
                [
                    Markup.button.callback(
                        '✅ Hecha',
                        `done:${task.id}`
                    ),
                    Markup.button.callback(
                        '🗑️ Eliminar',
                        `delete:${task.id}`
                    )
                ]
            ];

            if (task.recurrence) {

                buttons.push([
                    Markup.button.callback(
                        '🚫 Dejar de repetir',
                        `stoprepeat:${task.id}`
                    )
                ]);
            }

            await ctx.reply(
                `📋 TAREA #${task.id}\n\n` +
                `🔨 ${task.text}\n` +
                `⏰ ${formatDate(task.due_at)}` +
                (task.recurrence
                    ? `\n🔁 Se repite ${describeRecurrence(task.recurrence)}`
                    : ''),
                Markup.inlineKeyboard(buttons)
            );
        }
    }
);

/*
====================================================
COMPRAS
====================================================
*/

bot.hears(
    '🛒 Compras',
    async ctx => {

        if (!authorized(ctx)) return;

        const items =
            await getShopping();

        if (!items.length) {

            await ctx.reply(
                '🛒 Lista de compras vacía.',
                mainMenu()
            );

            return;
        }

        for (const item of items) {

            await ctx.reply(
                `🛒 ${item.item}`,
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '✅ Comprado',
                            `shopdone:${item.id}`
                        ),
                        Markup.button.callback(
                            '🗑️ Eliminar',
                            `shopdelete:${item.id}`
                        )
                    ]
                ])
            );
        }
    }
);

/*
====================================================
AÑADIR COMPRA
====================================================
*/

bot.hears(
    ['➕ Compra', '➕ Añadir compra'],
    async ctx => {

        sessions.set(
            ctx.from.id,
            {
                type: 'shopping'
            }
        );

        await ctx.reply(
            '🛒 ¿Qué quieres comprar?',
            cancelMenu()
        );
    }
);

/*
====================================================
RESUMEN
====================================================
*/

bot.hears(
    '📊 Resumen',
    async ctx => {

        if (!authorized(ctx)) return;

        const stats =
            await getStats();

        await ctx.reply(
            '📊 RESUMEN\n\n' +
            `📋 Pendientes: ${stats.pendingTasks}\n` +
            `✅ Completadas: ${stats.completedTasks}\n` +
            `🛒 Compras: ${stats.pendingShopping}`,
            mainMenu()
        );
    }
);

/*
====================================================
CANCELAR
====================================================
*/

bot.hears(
    '❌ Cancelar',
    async ctx => {

        if (!authorized(ctx)) return;

        sessions.delete(
            ctx.from.id
        );

        await ctx.reply(
            '❌ Cancelado.',
            mainMenu()
        );
    }
);

/*
====================================================
MENSAJES DE TEXTO
====================================================
*/

bot.on(
    'text',
    async ctx => {

        if (!authorized(ctx)) return;

        const session =
            sessions.get(
                ctx.from.id
            );

        if (!session) {

            /*
              INTENTAR ENTENDER AUTOMÁTICAMENTE
              UN RECORDATORIO SIN PULSAR BOTÓN.
            */

            const reminder =
                extractReminder(
                    ctx.message.text
                );

            if (reminder) {

                if (
                    reminder.date <= new Date()
                ) {

                    await ctx.reply(
                        '❌ Esa fecha/hora ya pasó.'
                    );

                    return;
                }

                const task =
                    await addTask(
                        reminder.text,
                        reminder.date.toISOString(),
                        reminder.recurrence
                    );

                await ctx.reply(
                    '⏰ RECORDATORIO CREADO\n\n' +
                    `📋 ${task.text}\n` +
                    `📅 ${formatDate(task.due_at)}\n` +
                    (task.recurrence
                        ? `🔁 Se repite ${describeRecurrence(task.recurrence)}\n`
                        : '') +
                    '\n🔔 Te avisaré automáticamente.',
                    mainMenu()
                );

                return;
            }

            await ctx.reply(
                'No estoy seguro de qué quieres hacer.\n\n' +
                'Puedes usar los botones del menú.',
                mainMenu()
            );

            return;
        }

        const rawText =
            ctx.message.text;

        const text = sanitizeText(rawText);

        if (!text) {

            await ctx.reply(
                '⚠️  Por favor, escribe algo válido.'
            );

            return;
        }

        try {

            /*
              TAREA NORMAL
            */

            if (
                session.type === 'task'
            ) {

                const task =
                    await addTask(text);

                sessions.delete(
                    ctx.from.id
                );

                await ctx.reply(
                    '✅ TAREA GUARDADA\n\n' +
                    `📋 ${task.text}\n\n` +
                    `🆔 ID: ${task.id}`,
                    mainMenu()
                );

                return;
            }

            /*
              COMPRA
            */

            if (
                session.type === 'shopping'
            ) {

                await addShopping(text);

                sessions.delete(
                    ctx.from.id
                );

                await ctx.reply(
                    `✅ COMPRA AÑADIDA\n\n` +
                    `🛒 ${text}`,
                    mainMenu()
                );

                return;
            }

            /*
              RECORDATORIO NATURAL
            */

            if (
                session.type === 'natural_reminder'
            ) {

                const reminder =
                    extractReminder(text);

                if (!reminder) {

                    await ctx.reply(
                        '❌ No pude entender la fecha/hora.\n\n' +
                        'Prueba por ejemplo:\n\n' +
                        '• Mañana a las 9 llamar al banco\n' +
                        '• En 30 minutos revisar la comida\n' +
                        '• El viernes a las 18:30\n' +
                        '• 2026-09-05 14:30'
                    );

                    return;
                }

                if (
                    reminder.date <= new Date()
                ) {

                    await ctx.reply(
                        '❌ Esa fecha/hora ya pasó.\n\n' +
                        'Escribe una fecha futura.'
                    );

                    return;
                }

                const task =
                    await addTask(
                        reminder.text,
                        reminder.date.toISOString(),
                        reminder.recurrence
                    );

                sessions.delete(
                    ctx.from.id
                );

                await ctx.reply(
                    '⏰ RECORDATORIO CREADO\n\n' +
                    `📋 ${task.text}\n` +
                    `📅 ${formatDate(task.due_at)}\n` +
                    (task.recurrence
                        ? `🔁 Se repite ${describeRecurrence(task.recurrence)}\n`
                        : '') +
                    `🆔 ID: ${task.id}\n\n` +
                    '🔔 Te avisaré automáticamente.',
                    mainMenu()
                );
            }

        } catch (error) {

            console.error(
                'Error procesando texto:',
                error
            );

            await ctx.reply(
                '❌ Ocurrió un error. Intenta de nuevo.',
                mainMenu()
            );

            sessions.delete(
                ctx.from.id
            );
        }
    }
);

/*
====================================================
BOTONES
====================================================
*/

bot.action(
    /^done:(\d+)$/,
    async ctx => {

        if (!authorized(ctx)) return;

        const id =
            Number(ctx.match[1]);

        const ok =
            await completeTask(id);

        await ctx.answerCbQuery(
            ok
                ? 'Tarea completada ✅'
                : 'Tarea no encontrada'
        );

        await ctx.editMessageText(
            ok
                ? `✅ Tarea #${id} completada.`
                : '❌ La tarea no existe.'
        );
    }
);

bot.action(
    /^stoprepeat:(\d+)$/,
    async ctx => {

        const id =
            Number(ctx.match[1]);

        const ok =
            await stopRecurrence(id);

        await ctx.answerCbQuery(
            ok
                ? 'Ya no se repetirá 🚫'
                : 'No encontrada'
        );

        await ctx.editMessageText(
            ok
                ? `🚫 La tarea #${id} deja de repetirse.\n\n` +
                  'Sigue pendiente esta vez; si tampoco la quieres, ' +
                  'bórrala desde 📋 Mis tareas.'
                : '❌ Esa tarea ya no existe.'
        );
    }
);

bot.action(
    /^delete:(\d+)$/,
    async ctx => {

        const id =
            Number(ctx.match[1]);

        await ctx.answerCbQuery();

        await ctx.editMessageText(
            `🗑️ ¿Eliminar tarea #${id}?\n\n` +
            '(Esta acción no se puede deshacer)',
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        '✅ Sí, eliminar',
                        `confirm_delete:${id}`
                    ),
                    Markup.button.callback(
                        '❌ Cancelar',
                        `cancel_delete:${id}`
                    )
                ]
            ])
        );
    }
);

bot.action(
    /^confirm_delete:(\d+)$/,
    async ctx => {

        const id =
            Number(ctx.match[1]);

        await deleteTask(id);

        await ctx.answerCbQuery(
            'Tarea eliminada 🗑️'
        );

        await ctx.editMessageText(
            `✅ Tarea #${id} eliminada.`
        );
    }
);

bot.action(
    /^cancel_delete:(\d+)$/,
    async ctx => {

        const id =
            Number(ctx.match[1]);

        await ctx.answerCbQuery(
            'Cancelado ❌'
        );

        await ctx.editMessageText(
            `📋 TAREA #${id}\n\nOperación cancelada.`
        );
    }
);

bot.action(
    /^shopdone:(\d+)$/,
    async ctx => {

        if (!authorized(ctx)) return;

        const id =
            Number(ctx.match[1]);

        await completeShopping(id);

        await ctx.answerCbQuery(
            'Compra completada ✅'
        );

        await ctx.editMessageText(
            '✅ Compra completada.'
        );
    }
);

bot.action(
    /^shopdelete:(\d+)$/,
    async ctx => {

        const id =
            Number(ctx.match[1]);

        await ctx.answerCbQuery();

        await ctx.editMessageText(
            `🗑️ ¿Eliminar esta compra (#${id})?\n\n` +
            '(Esta acción no se puede deshacer)',
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        '✅ Sí, eliminar',
                        `confirm_shopdelete:${id}`
                    ),
                    Markup.button.callback(
                        '❌ Cancelar',
                        `cancel_shopdelete:${id}`
                    )
                ]
            ])
        );
    }
);

bot.action(
    /^confirm_shopdelete:(\d+)$/,
    async ctx => {

        const id =
            Number(ctx.match[1]);

        await deleteShopping(id);

        await ctx.answerCbQuery(
            'Compra eliminada 🗑️'
        );

        await ctx.editMessageText(
            `✅ Compra #${id} eliminada.`
        );
    }
);

bot.action(
    /^cancel_shopdelete:(\d+)$/,
    async ctx => {

        const id =
            Number(ctx.match[1]);

        await ctx.answerCbQuery(
            'Cancelado ❌'
        );

        await ctx.editMessageText(
            `🛒 COMPRA #${id}\n\nOperación cancelada.`
        );
    }
);

/*
====================================================
MOTOR DE RECORDATORIOS
====================================================

NO usamos node-cron.

El proceso revisa cada 5 segundos.

Si Android/Termux se retrasa unos segundos,
el recordatorio sigue siendo detectado cuando
el proceso vuelve a ejecutarse.

====================================================
*/

/*
====================================================
RESUMEN DIARIO
====================================================

Un mensaje por la mañana con lo que hay por delante.
*/

const SUMMARY_HOUR_DEFAULT = 8;


async function buildSummary() {

    const [tasks, shopping] = await Promise.all([
        getPendingTasks(),
        getShopping()
    ]);

    const hoy = tiempo.ahora();

    const atrasadas = [];
    const deHoy = [];
    const proximas = [];
    const sinFecha = [];

    for (const task of tasks) {

        if (!task.due_at) {
            sinFecha.push(task);
            continue;
        }

        if (tiempo.esDelDia(task.due_at, hoy)) {
            deHoy.push(task);
            continue;
        }

        if (new Date(task.due_at) < new Date()) {
            atrasadas.push(task);
            continue;
        }

        proximas.push(task);
    }

    let mensaje =
        '☀️ RESUMEN DEL DÍA\n' +
        `${tiempo.formatear(new Date()).split(',').slice(0, 2).join(',')}\n`;

    if (atrasadas.length) {

        mensaje += `\n⚠️ ATRASADAS (${atrasadas.length})\n`;

        for (const t of atrasadas.slice(0, 10)) {
            mensaje +=
                `  • ${t.text} — ${tiempo.formatearCorto(t.due_at)}\n`;
        }
    }

    if (deHoy.length) {

        mensaje += `\n📅 HOY (${deHoy.length})\n`;

        for (const t of deHoy) {
            mensaje +=
                `  • ${tiempo.soloHora(t.due_at)}  ${t.text}` +
                `${t.recurrence ? ' 🔁' : ''}\n`;
        }
    }

    if (sinFecha.length) {

        mensaje += `\n📋 SIN FECHA (${sinFecha.length})\n`;

        for (const t of sinFecha.slice(0, 10)) {
            mensaje += `  • ${t.text}\n`;
        }
    }

    if (proximas.length) {

        const siguiente = proximas[0];

        mensaje +=
            `\n🔜 Lo siguiente: ${siguiente.text} ` +
            `(${tiempo.formatearCorto(siguiente.due_at)})\n`;
    }

    if (shopping.length) {

        mensaje +=
            `\n🛒 COMPRAS (${shopping.length})\n  ` +
            shopping.slice(0, 12).map(i => i.item).join(', ') + '\n';
    }

    if (
        !atrasadas.length &&
        !deHoy.length &&
        !sinFecha.length &&
        !shopping.length
    ) {
        mensaje += '\n🎉 No tienes nada pendiente. Disfruta el día.\n';
    }

    return mensaje;
}


/*
   Se comprueba con la misma frecuencia que los recordatorios.

   La condición es "ya son las 8 o más y hoy no se ha
   mandado", en vez de "son exactamente las 8": si el
   servicio estaba dormido a esa hora, el resumen llega
   igual en cuanto despierta.
*/

let checkingSummary = false;

async function checkDailySummary() {

    if (checkingSummary) {
        return;
    }

    checkingSummary = true;

    try {

        const config = await getSummaryConfig();

        if (config.hour === null || config.hour === undefined) {
            return;
        }

        const hoy = tiempo.ahora();
        const diaDeHoy = tiempo.diaTexto(hoy);

        if (config.sentOn === diaDeHoy) {
            return;
        }

        if (hoy.hour < config.hour) {
            return;
        }

        await bot.telegram.sendMessage(
            OWNER_ID,
            await buildSummary(),
            mainMenu()
        );

        await markSummarySent(diaDeHoy);

        console.log(`☀️ Resumen diario enviado (${diaDeHoy})`);

    } catch (error) {

        console.error(
            '❌ Error con el resumen diario:',
            error.message
        );

    } finally {

        checkingSummary = false;
    }
}


let checkingReminders = false;

async function checkReminders() {

    if (checkingReminders) {
        return;
    }

    checkingReminders = true;

    try {

        const tasks =
            await getDueTasks();

        if (tasks.length === 0) {
            checkingReminders = false;
            return;
        }

        console.log(
            `⏰ Comprobando recordatorios: ${tasks.length} pendiente(s)`
        );

        for (const task of tasks) {

            try {

                /*
                   Si se repite, se deja programada la
                   siguiente antes de avisar, para poder
                   decir en el mismo mensaje cuándo vuelve.
                */

                const next =
                    await scheduleNext(task);

                const buttons = [
                    [
                        Markup.button.callback(
                            '✅ Completado',
                            `done:${task.id}`
                        )
                    ]
                ];

                if (next) {

                    buttons.push([
                        Markup.button.callback(
                            '🚫 Dejar de repetir',
                            `stoprepeat:${next.id}`
                        )
                    ]);
                }

                await bot.telegram.sendMessage(
                    OWNER_ID,
                    '🔔 RECORDATORIO\n\n' +
                    `📋 ${task.text}\n` +
                    `⏰ ${formatDate(task.due_at)}\n` +
                    (next
                        ? `🔁 Siguiente: ${formatDate(next.due_at)}\n`
                        : '') +
                    `🆔 ID: ${task.id}`,
                    Markup.inlineKeyboard(buttons)
                );

                await markNotified(
                    task.id
                );

                console.log(
                    `✅ Recordatorio enviado #${task.id}: ${task.text}` +
                    (next ? ` (se repite el ${next.due_at})` : '')
                );

            } catch (error) {

                console.error(
                    `❌ Error con recordatorio #${task.id}:`,
                    error.message
                );
            }
        }

    } catch (error) {

        console.error(
            '❌ Error comprobando recordatorios:',
            error.message
        );

    } finally {

        checkingReminders = false;
    }
}

/*
   Comprobación inicial y después cada REMINDER_INTERVAL.

   Antes eran 5 segundos porque la base de datos era un
   archivo local. Ahora cada comprobación es una consulta
   de red a Neon, así que 30 segundos evita gastar batería
   y datos del móvil sin que se noten retrasos.
*/

const REMINDER_INTERVAL =
    Number(process.env.REMINDER_INTERVAL_MS) || 30000;

/*
====================================================
ARRANQUE
====================================================
*/

bot.catch((err, ctx) => {

    console.error(
        `❌ Error del bot (usuario ${ctx.from?.id}):`,
        err.message || err
    );

    ctx.reply(
        '❌ Ocurrió un error inesperado.\n\n' +
        'Por favor intenta de nuevo o escribe /help'
    ).catch(replyErr => {
        console.error('Error enviando mensaje de error:', replyErr.message);
    });
});

/*
====================================================
SERVIDOR WEB (solo en Render y similares)
====================================================

Cuando existe PORT, el bot también sirve la Mini App y
la API desde el mismo proceso y el mismo dominio, así no
hace falta alojarlas aparte ni configurar CORS.

Termux no define PORT, así que allí el bot funciona solo
como bot, igual que siempre.
*/

const webServer = require('./server');


async function main() {

    /*
       El puerto se abre primero para que Render lo detecte
       cuanto antes y no cancele el despliegue.
    */

    webServer.start();

    /*
       Se comprueba la base de datos antes de arrancar: si
       Neon no responde, es mejor saberlo ahora que al recibir
       el primer mensaje.
    */

    try {

        const userId = await getOwnerUserId();

        console.log(
            `🗄️  Base de datos conectada (usuario #${userId})`
        );

    } catch (error) {

        console.error(
            '❌ No se pudo conectar a la base de datos:',
            error.message
        );

        console.error(
            '   Revisa DATABASE_URL en .env y tu conexión a internet.'
        );

        process.exit(1);
    }

    /*
       El motor de recordatorios usa bot.telegram, que no
       necesita el polling activo, así que se arranca antes
       de launch() y no depende de cuándo resuelva.
    */

    checkReminders();
    checkDailySummary();

    setInterval(
        () => {
            checkReminders();
            checkDailySummary();
        },
        REMINDER_INTERVAL
    );

    console.log(
        '======================================'
    );

    console.log(
        '🤖 SECRETARIO PERSONAL V3 ENCENDIDO'
    );

    console.log(
        `👤 Propietario: ${OWNER_ID}`
    );

    console.log(
        `⏰ Recordatorios: cada ${REMINDER_INTERVAL / 1000} segundos`
    );

    console.log(
        `📊 Rate limit: ${RATE_LIMIT_MAX} requests/${RATE_LIMIT_WINDOW / 1000}s`
    );

    console.log(
        '======================================'
    );

    console.log(
        `✅ Hora de inicio: ${tiempo.formatear(new Date())} (${tiempo.ZONA})`
    );

    await lanzarBot();
}


/*
   Telegram solo deja que un proceso lea los mensajes de un
   bot. Al desplegar, el servicio nuevo arranca antes de que
   muera el viejo, y durante unos segundos son dos: eso es el
   409, y se pasa solo.

   Por eso se reintenta unas cuantas veces antes de rendirse.
   Si el conflicto persiste no es el despliegue: es que hay
   otro bot corriendo de verdad, casi siempre el del móvil.
*/

const INTENTOS_LANZAMIENTO = 6;
const ESPERA_ENTRE_INTENTOS = 5000;

async function lanzarBot() {

    for (let intento = 1; intento <= INTENTOS_LANZAMIENTO; intento++) {

        try {

            await bot.launch();

            return;

        } catch (error) {

            const esConflicto =
                error.response?.error_code === 409 ||
                /409|conflict/i.test(error.message || '');

            if (!esConflicto) {
                throw error;
            }

            if (intento === INTENTOS_LANZAMIENTO) {

                console.error(
                    '❌ Sigue habiendo otro bot leyendo los mensajes.'
                );

                console.error(
                    '   Si lo tienes arrancado en Termux, pármalo con Ctrl+C:'
                );

                console.error(
                    '   Telegram no permite dos instancias del mismo bot.'
                );

                throw error;
            }

            console.warn(
                `⚠️  Otro proceso tiene el bot (409). ` +
                `Reintento ${intento}/${INTENTOS_LANZAMIENTO - 1} ` +
                `en ${ESPERA_ENTRE_INTENTOS / 1000}s...`
            );

            await new Promise(
                resolve => setTimeout(resolve, ESPERA_ENTRE_INTENTOS)
            );
        }
    }
}

main().catch(err => {

    console.error(
        '❌ Error al lanzar el bot:',
        err.message
    );

    process.exit(1);
});

process.once(
    'SIGINT',
    () => bot.stop('SIGINT')
);

process.once(
    'SIGTERM',
    () => bot.stop('SIGTERM')
);
