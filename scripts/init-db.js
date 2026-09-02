/*
 * CREAR LAS TABLAS
 *
 * Uso:  node scripts/init-db.js
 *
 * Aplica db/schema.sql sobre la base de datos de DATABASE_URL.
 * Es seguro ejecutarlo varias veces: todo usa IF NOT EXISTS.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

if (!process.env.DATABASE_URL) {
    console.error('❌ Falta DATABASE_URL en .env');
    process.exit(1);
}

const sql = require('../lib/db');

const SCHEMA_FILE =
    path.join(__dirname, '..', 'db', 'schema.sql');

/*
   El driver HTTP de Neon acepta una sentencia por llamada,
   así que el fichero se parte por ';'.
*/

function readStatements() {

    const schema =
        fs.readFileSync(SCHEMA_FILE, 'utf8');

    return schema
        .split(';')
        .map(statement => statement.trim())
        .filter(statement => statement.length > 0);
}

async function main() {

    const statements = readStatements();

    console.log(
        `📄 Aplicando ${statements.length} sentencias de db/schema.sql\n`
    );

    for (const statement of statements) {

        const label =
            statement.split('\n')[0].slice(0, 60);

        try {

            await sql.query(statement);

            console.log(`  ✅ ${label}`);

        } catch (error) {

            console.error(`  ❌ ${label}`);
            console.error(`     ${error.message}`);

            process.exit(1);
        }
    }

    console.log('\n✅ Base de datos lista.');
}

main().catch(error => {

    console.error('❌ Error:', error.message);

    process.exit(1);
});
