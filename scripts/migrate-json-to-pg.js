/*
 * MIGRAR LOS DATOS DE TERMUX A POSTGRESQL
 *
 * Uso:  node scripts/migrate-json-to-pg.js
 *
 * Sube lo que ya tenías en data/database.json (la base de
 * datos local del bot) a la base de datos compartida con la
 * Mini App.
 *
 * Se puede ejecutar varias veces: salta lo que ya existe.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

if (!process.env.DATABASE_URL) {
    console.error('❌ Falta DATABASE_URL en .env');
    process.exit(1);
}

if (!process.env.OWNER_ID) {
    console.error('❌ Falta OWNER_ID en .env');
    process.exit(1);
}

const sql = require('../lib/db');
const { getOwnerUserId } = require('../database');

const JSON_FILE =
    path.join(__dirname, '..', 'data', 'database.json');

function readLocalDatabase() {

    if (!fs.existsSync(JSON_FILE)) {

        console.log(
            `ℹ️  No hay datos locales en ${JSON_FILE}`
        );

        console.log(
            '   Nada que migrar.'
        );

        return null;
    }

    try {

        return JSON.parse(
            fs.readFileSync(JSON_FILE, 'utf8')
        );

    } catch (error) {

        console.error(
            '❌ El archivo local está dañado:',
            error.message
        );

        process.exit(1);
    }
}

async function migrateTasks(userId, tasks) {

    let migrated = 0;
    let skipped = 0;

    for (const task of tasks) {

        const existing = await sql`
            SELECT id
            FROM tasks
            WHERE
                user_id = ${userId}
                AND title = ${task.text}
            LIMIT 1
        `;

        if (existing.length) {
            skipped++;
            continue;
        }

        await sql`
            INSERT INTO tasks (
                user_id,
                title,
                due_at,
                completed,
                notified,
                created_at
            )
            VALUES (
                ${userId},
                ${task.text},
                ${task.due_at || null},
                ${Boolean(task.done)},
                ${Boolean(task.notified)},
                ${task.created_at || new Date().toISOString()}
            )
        `;

        migrated++;
    }

    return { migrated, skipped };
}

async function migrateShopping(userId, items) {

    let migrated = 0;
    let skipped = 0;

    for (const item of items) {

        const existing = await sql`
            SELECT id
            FROM shopping_items
            WHERE
                user_id = ${userId}
                AND name = ${item.item}
            LIMIT 1
        `;

        if (existing.length) {
            skipped++;
            continue;
        }

        await sql`
            INSERT INTO shopping_items (
                user_id,
                name,
                completed,
                created_at
            )
            VALUES (
                ${userId},
                ${item.item},
                ${Boolean(item.done)},
                ${item.created_at || new Date().toISOString()}
            )
        `;

        migrated++;
    }

    return { migrated, skipped };
}

async function main() {

    const data = readLocalDatabase();

    if (!data) {
        return;
    }

    const userId = await getOwnerUserId();

    console.log(
        `👤 Usuario destino: #${userId} (telegram ${process.env.OWNER_ID})\n`
    );

    const tasks =
        await migrateTasks(userId, data.tasks || []);

    console.log(
        `📋 Tareas:  ${tasks.migrated} migradas, ${tasks.skipped} ya existían`
    );

    const shopping =
        await migrateShopping(userId, data.shopping || []);

    console.log(
        `🛒 Compras: ${shopping.migrated} migradas, ${shopping.skipped} ya existían`
    );

    console.log(
        '\n✅ Migración terminada.'
    );

    console.log(
        `   El archivo ${JSON_FILE} sigue intacto por si acaso.`
    );
}

main().catch(error => {

    console.error('❌ Error:', error.message);

    process.exit(1);
});
