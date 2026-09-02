/*
 * BASE DE DATOS COMPARTIDA (PostgreSQL / Neon)
 *
 * El bot (Termux) y la Mini App (Vercel) usan ESTA misma base
 * de datos, así que las tareas y compras se ven en los dos sitios.
 *
 * Neon viaja por HTTP, no por TCP, así que funciona en Termux
 * sin abrir puertos ni túneles.
 *
 * Las funciones devuelven los campos con los nombres que usa el
 * bot (text, done, item) aunque en la tabla se llamen title,
 * completed y name.
 */

const sql = require('./lib/db');

const OWNER_ID = String(process.env.OWNER_ID || '');

let ownerUserId = null;

/*
====================================================
USUARIO PROPIETARIO
====================================================

La Mini App crea el usuario a partir del initData de
Telegram. El bot crea (o reutiliza) esa misma fila
buscando por telegram_id, así ambos comparten datos.
*/

async function getOwnerUserId() {

    if (ownerUserId) {
        return ownerUserId;
    }

    if (!OWNER_ID) {
        throw new Error('OWNER_ID no está configurado');
    }

    const rows = await sql`
        INSERT INTO users (telegram_id)
        VALUES (${OWNER_ID})
        ON CONFLICT (telegram_id)
        DO UPDATE SET updated_at = NOW()
        RETURNING id
    `;

    ownerUserId = rows[0].id;

    return ownerUserId;
}

/*
====================================================
TRADUCCIÓN DE FILAS
====================================================
*/

function toTask(row) {

    return {
        id: row.id,
        text: row.title,
        due_at: row.due_at,
        done: row.completed,
        notified: row.notified,
        created_at: row.created_at
    };
}

function toShopping(row) {

    return {
        id: row.id,
        item: row.name,
        done: row.completed,
        created_at: row.created_at
    };
}

/*
====================================================
TAREAS
====================================================
*/

async function addTask(text, dueAt = null) {

    const userId = await getOwnerUserId();

    const rows = await sql`
        INSERT INTO tasks (user_id, title, due_at)
        VALUES (${userId}, ${text}, ${dueAt})
        RETURNING *
    `;

    return toTask(rows[0]);
}

async function getPendingTasks() {

    const userId = await getOwnerUserId();

    const rows = await sql`
        SELECT *
        FROM tasks
        WHERE
            user_id = ${userId}
            AND completed = FALSE
        ORDER BY
            due_at ASC NULLS LAST,
            id DESC
    `;

    return rows.map(toTask);
}

async function getDueTasks() {

    const userId = await getOwnerUserId();

    const rows = await sql`
        SELECT *
        FROM tasks
        WHERE
            user_id = ${userId}
            AND completed = FALSE
            AND notified = FALSE
            AND due_at IS NOT NULL
            AND due_at <= NOW()
        ORDER BY due_at ASC
    `;

    return rows.map(toTask);
}

async function markNotified(id) {

    const userId = await getOwnerUserId();

    const rows = await sql`
        UPDATE tasks
        SET notified = TRUE, updated_at = NOW()
        WHERE id = ${Number(id)} AND user_id = ${userId}
        RETURNING id
    `;

    return rows.length > 0;
}

async function completeTask(id) {

    const userId = await getOwnerUserId();

    const rows = await sql`
        UPDATE tasks
        SET completed = TRUE, updated_at = NOW()
        WHERE id = ${Number(id)} AND user_id = ${userId}
        RETURNING id
    `;

    return rows.length > 0;
}

async function deleteTask(id) {

    const userId = await getOwnerUserId();

    const rows = await sql`
        DELETE FROM tasks
        WHERE id = ${Number(id)} AND user_id = ${userId}
        RETURNING id
    `;

    return rows.length > 0;
}

/*
====================================================
COMPRAS
====================================================
*/

async function addShopping(item) {

    const userId = await getOwnerUserId();

    const rows = await sql`
        INSERT INTO shopping_items (user_id, name)
        VALUES (${userId}, ${item})
        RETURNING *
    `;

    return toShopping(rows[0]);
}

async function getShopping() {

    const userId = await getOwnerUserId();

    const rows = await sql`
        SELECT *
        FROM shopping_items
        WHERE
            user_id = ${userId}
            AND completed = FALSE
        ORDER BY created_at DESC
    `;

    return rows.map(toShopping);
}

async function completeShopping(id) {

    const userId = await getOwnerUserId();

    const rows = await sql`
        UPDATE shopping_items
        SET completed = TRUE, updated_at = NOW()
        WHERE id = ${Number(id)} AND user_id = ${userId}
        RETURNING id
    `;

    return rows.length > 0;
}

async function deleteShopping(id) {

    const userId = await getOwnerUserId();

    const rows = await sql`
        DELETE FROM shopping_items
        WHERE id = ${Number(id)} AND user_id = ${userId}
        RETURNING id
    `;

    return rows.length > 0;
}

/*
====================================================
ESTADÍSTICAS
====================================================
*/

async function getStats() {

    const userId = await getOwnerUserId();

    const rows = await sql`
        SELECT
            (SELECT COUNT(*) FROM tasks
             WHERE user_id = ${userId}) AS total_tasks,

            (SELECT COUNT(*) FROM tasks
             WHERE user_id = ${userId}
             AND completed = FALSE) AS pending_tasks,

            (SELECT COUNT(*) FROM tasks
             WHERE user_id = ${userId}
             AND completed = TRUE) AS completed_tasks,

            (SELECT COUNT(*) FROM shopping_items
             WHERE user_id = ${userId}
             AND completed = FALSE) AS pending_shopping
    `;

    const row = rows[0];

    return {
        totalTasks: Number(row.total_tasks),
        pendingTasks: Number(row.pending_tasks),
        completedTasks: Number(row.completed_tasks),
        pendingShopping: Number(row.pending_shopping)
    };
}

module.exports = {
    getOwnerUserId,
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
};
