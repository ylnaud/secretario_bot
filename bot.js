require('dotenv').config();

const {
    Telegraf,
    Markup
} = require('telegraf');

const {
    addTask,
    getPendingTasks,
    getDueTasks,
    markNotified,
    completeTask,
    deleteTask,
    addShopping,
    getShopping,
    completeShopping,
    deleteShopping,
    getStats
} = require('./database');

const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = Number(process.env.OWNER_ID);

if (!BOT_TOKEN) {
    console.error('❌ Falta BOT_TOKEN en .env');
    process.exit(1);
}

if (!OWNER_ID) {
    console.error('❌ Falta OWNER_ID en .env');
    process.exit(1);
}

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
        ['➕ Nueva tarea', '📋 Mis tareas'],
        ['⏰ Recordatorio', '🛒 Compras'],
        ['➕ Compra', '📊 Resumen'],
        ['❓ Ayuda', '🏠 Inicio']
    ]).resize();
}

function cancelMenu() {

    return Markup.keyboard([
        ['❌ Cancelar', '🏠 Inicio']
    ]).resize();
}

function formatDate(dateString) {

    if (!dateString) {
        return 'Sin fecha';
    }

    return new Date(dateString).toLocaleString(
        'es-ES',
        {
            dateStyle: 'full',
            timeStyle: 'short'
        }
    );
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

function setTime(date, hour, minute = 0) {

    date.setHours(
        Number(hour),
        Number(minute),
        0,
        0
    );

    return date;
}

function nextWeekday(baseDate, weekday) {

    const result = new Date(baseDate);

    const current = result.getDay();

    let difference =
        (weekday - current + 7) % 7;

    if (difference === 0) {
        difference = 7;
    }

    result.setDate(
        result.getDate() + difference
    );

    return result;
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

function parseNaturalDate(text) {

    const normalized = normalizeText(text);

    const now = new Date();

    /*
       EN X MINUTOS
    */

    let match = normalized.match(
        /(?:en|dentro de)\s+(\d+)\s+minutos?/
    );

    if (match) {

        return {
            date: new Date(
                now.getTime() +
                Number(match[1]) * 60 * 1000
            ),
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
            date: new Date(
                now.getTime() +
                Number(match[1]) * 60 * 60 * 1000
            ),
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

        const date = new Date(now);

        date.setDate(
            date.getDate() +
            Number(match[1])
        );

        const time = parseTime(normalized);

        if (time) {
            setTime(
                date,
                time.hour,
                time.minute
            );
        }

        return {
            date,
            confidence: 'high'
        };
    }

    /*
       MAÑANA
    */

    if (normalized.includes('manana')) {

        const date = new Date(now);

        date.setDate(
            date.getDate() + 1
        );

        const time = parseTime(normalized);

        if (time) {

            setTime(
                date,
                time.hour,
                time.minute
            );

        } else {

            setTime(
                date,
                9,
                0
            );
        }

        return {
            date,
            confidence: 'high'
        };
    }

    /*
       HOY
    */

    if (/\bhoy\b/.test(normalized)) {

        const time = parseTime(normalized);

        if (!time) {
            return null;
        }

        const date = new Date(now);

        setTime(
            date,
            time.hour,
            time.minute
        );

        return {
            date,
            confidence: 'high'
        };
    }

    /*
       ESTA TARDE
    */

    if (
        normalized.includes('esta tarde') ||
        normalized.includes('esta noche')
    ) {

        const date = new Date(now);

        const time = parseTime(normalized);

        if (time) {

            setTime(
                date,
                time.hour,
                time.minute
            );

        } else {

            setTime(
                date,
                18,
                0
            );
        }

        if (date <= now) {
            date.setDate(
                date.getDate() + 1
            );
        }

        return {
            date,
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

        if (
            normalized.includes(
                `el ${name}`
            ) ||
            normalized.includes(name)
        ) {

            const date =
                nextWeekday(
                    now,
                    number
                );

            const time =
                parseTime(normalized);

            if (time) {

                setTime(
                    date,
                    time.hour,
                    time.minute
                );

            } else {

                setTime(
                    date,
                    9,
                    0
                );
            }

            return {
                date,
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

        const day = Number(match[1]);
        const month = Number(match[2]) - 1;

        const year =
            match[3]
                ? Number(match[3])
                : now.getFullYear();

        const date = new Date(
            year,
            month,
            day
        );

        const time =
            parseTime(normalized);

        if (time) {

            setTime(
                date,
                time.hour,
                time.minute
            );

        } else {

            setTime(
                date,
                9,
                0
            );
        }

        if (
            !match[3] &&
            date < now
        ) {
            date.setFullYear(
                date.getFullYear() + 1
            );
        }

        return {
            date,
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

        const date = new Date(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3]),
            Number(match[4] || 9),
            Number(match[5] || 0),
            0
        );

        return {
            date,
            confidence: 'high'
        };
    }

    return null;
}

function extractReminder(text) {

    const parsed =
        parseNaturalDate(text);

    if (!parsed) {
        return null;
    }

    let cleanText = text;

    cleanText = cleanText
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
            /\bmanana\b/gi,
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
        date: parsed.date
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

bot.start(async ctx => {

    const taskCount = getPendingTasks().length;
    const shoppingCount = getShopping().length;

    await ctx.reply(
        '🤖 SECRETARIO PERSONAL V3\n\n' +
        '¡Hola! Estoy listo para ayudarte.\n\n' +
        `📊 Estado actual:\n` +
        `📋 Tareas pendientes: ${taskCount}\n` +
        `🛒 Artículos de compra: ${shoppingCount}\n\n` +
        'Escribe /help para ver comandos disponibles.',
        mainMenu()
    );
});

bot.command('help', async ctx => {

    await ctx.reply(
        '❓ COMANDOS DISPONIBLES\n\n' +
        '📋 Tareas:\n' +
        '  • ➕ Nueva tarea\n' +
        '  • 📋 Mis tareas\n\n' +
        '⏰ Recordatorios:\n' +
        '  • ⏰ Recordatorio\n' +
        '  • Escribe: "Mañana a las 9"\n\n' +
        '🛒 Compras:\n' +
        '  • 🛒 Compras\n' +
        '  • ➕ Compra\n\n' +
        '📊 Otros:\n' +
        '  • /help - Este mensaje\n' +
        '  • /id - Tu ID de usuario\n' +
        '  • 📊 Resumen - Estadísticas\n' +
        '  • 🏠 Inicio - Menú principal',
        mainMenu()
    );
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

    const taskCount = getPendingTasks().length;

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
            'Ejemplos:\n\n' +
            'Recuérdame mañana a las 9 llamar al banco\n\n' +
            'En 30 minutos revisar la comida\n\n' +
            'El viernes a las 18:30 llevar documentos',
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
            getPendingTasks();

        if (!tasks.length) {

            await ctx.reply(
                '🎉 No tienes tareas pendientes.',
                mainMenu()
            );

            return;
        }

        for (const task of tasks) {

            await ctx.reply(
                `📋 TAREA #${task.id}\n\n` +
                `🔨 ${task.text}\n` +
                `⏰ ${formatDate(task.due_at)}`,
                Markup.inlineKeyboard([
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
                ])
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
            getShopping();

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
    '➕ Añadir compra',
    async ctx => {

        if (!authorized(ctx)) return;

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
            getStats();

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
                    addTask(
                        reminder.text,
                        reminder.date.toISOString()
                    );

                await ctx.reply(
                    '⏰ RECORDATORIO CREADO\n\n' +
                    `📋 ${task.text}\n` +
                    `📅 ${formatDate(task.due_at)}\n\n` +
                    '🔔 Te avisaré automáticamente.',
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
                    addTask(text);

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

                addShopping(text);

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
                    addTask(
                        reminder.text,
                        reminder.date.toISOString()
                    );

                sessions.delete(
                    ctx.from.id
                );

                await ctx.reply(
                    '⏰ RECORDATORIO CREADO\n\n' +
                    `📋 ${task.text}\n` +
                    `📅 ${formatDate(task.due_at)}\n` +
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
            completeTask(id);

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

        deleteTask(id);

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

        completeShopping(id);

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

        deleteShopping(id);

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

let checkingReminders = false;

async function checkReminders() {

    if (checkingReminders) {
        return;
    }

    checkingReminders = true;

    try {

        const tasks =
            getDueTasks();

        if (tasks.length === 0) {
            checkingReminders = false;
            return;
        }

        console.log(
            `⏰ Comprobando recordatorios: ${tasks.length} pendiente(s)`
        );

        for (const task of tasks) {

            try {

                await bot.telegram.sendMessage(
                    OWNER_ID,
                    '🔔 RECORDATORIO\n\n' +
                    `📋 ${task.text}\n` +
                    `⏰ ${formatDate(task.due_at)}\n` +
                    `🆔 ID: ${task.id}`,
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                '✅ Completado',
                                `done:${task.id}`
                            )
                        ]
                    ])
                );

                markNotified(
                    task.id
                );

                console.log(
                    `✅ Recordatorio enviado #${task.id}: ${task.text}`
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
   Comprobación inicial y después
   cada 5 segundos.
*/

checkReminders();

setInterval(
    checkReminders,
    5000
);

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

bot.launch().then(() => {

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
        `⏰ Recordatorios: cada 5 segundos`
    );

    console.log(
        `📊 Rate limit: ${RATE_LIMIT_MAX} requests/${RATE_LIMIT_WINDOW/1000}s`
    );

    console.log(
        '======================================'
    );

    console.log(
        `✅ Hora de inicio: ${new Date().toLocaleString('es-ES')}`
    );

}).catch(err => {

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
