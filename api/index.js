const sql = require('../lib/db');
const {
  validateTelegramInitData
} = require('../lib/telegram');

function json(res, status, data) {

  res.status(status).json(data);

}

function methodNotAllowed(res) {

  return json(res, 405, {
    ok: false,
    error: 'Método no permitido'
  });

}

function getPath(req) {

  /*
   * La ruta llega en la query, porque vercel.json reescribe
   * /api/tasks/5 como /api/index.js?path=tasks/5. Una cadena
   * vacía es válida: significa /api a secas.
   */

  const fromQuery = req.query && req.query.path;

  if (Array.isArray(fromQuery)) {
    return fromQuery.join('/');
  }

  if (typeof fromQuery === 'string') {
    return fromQuery;
  }

  /*
   * Respaldo por si la query no llega. Se quita el prefijo
   * /api y también el nombre del archivo, que aparece cuando
   * la reescritura apunta directamente a él.
   */

  const raw = req.url || '';

  const clean = raw.split('?')[0];

  return clean
    .replace(/^\/api\/?/, '')
    .replace(/^index\.js$/, '');

}

async function getTelegramUser(req) {

  const initData =
    req.headers['x-telegram-init-data'];

  if (!initData) {

    const error = new Error(
      'Telegram no ha enviado initData. Abre la app desde tu bot.'
    );

    error.status = 401;

    throw error;
  }

  return validateTelegramInitData(initData);
}


async function getOrCreateUser(telegramUser) {

  const telegramId =
    String(telegramUser.id);

  const firstName =
    telegramUser.first_name || '';

  const lastName =
    telegramUser.last_name || '';

  const username =
    telegramUser.username || null;

  const result = await sql`
    INSERT INTO users (
      telegram_id,
      first_name,
      last_name,
      username
    )
    VALUES (
      ${telegramId},
      ${firstName},
      ${lastName},
      ${username}
    )

    ON CONFLICT (telegram_id)

    DO UPDATE SET
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      username = EXCLUDED.username,
      updated_at = NOW()

    RETURNING *
  `;

  return result[0];
}


module.exports = async function handler(req, res) {

  try {

    const path = getPath(req);

    /*
     * HEALTH CHECK
     *
     * También responde en /api a secas: así se distingue de un
     * vistazo si la función existe pero falla el enrutado, o si
     * Vercel no la ha desplegado.
     */

    if (path === '' || path === 'health') {

      return json(res, 200, {
        ok: true,
        service: 'secretario-api',
        path: path || '(raíz)',
        time: new Date().toISOString()
      });

    }


    /*
     * TELEGRAM USER
     */

    const telegramUser =
      await getTelegramUser(req);

    const user =
      await getOrCreateUser(telegramUser);

    /*
     * TASKS
     */

    if (path === 'tasks') {

      if (req.method === 'GET') {

        const rows = await sql`
          SELECT *
          FROM tasks
          WHERE user_id = ${user.id}
          ORDER BY
            completed ASC,
            due_at ASC NULLS LAST,
            created_at DESC
        `;

        return json(res, 200, {
          ok: true,
          tasks: rows
        });

      }


      if (req.method === 'POST') {

        const {
          title,
          description = null,
          due_at = null,
          recurrence = null
        } = req.body || {};

        if (!title || !String(title).trim()) {

          return json(res, 400, {
            ok: false,
            error: 'El título es obligatorio'
          });

        }

        if (
          recurrence &&
          !['daily', 'weekly', 'monthly'].includes(recurrence)
        ) {

          return json(res, 400, {
            ok: false,
            error: 'La repetición debe ser daily, weekly o monthly'
          });

        }

        /*
         * Una tarea que se repite necesita fecha: sin ella no
         * hay desde dónde contar la siguiente vez.
         */

        if (recurrence && !due_at) {

          return json(res, 400, {
            ok: false,
            error: 'Una tarea que se repite necesita fecha'
          });

        }

        const rows = await sql`
          INSERT INTO tasks (
            user_id,
            title,
            description,
            due_at,
            recurrence
          )
          VALUES (
            ${user.id},
            ${String(title).trim()},
            ${description},
            ${due_at || null},
            ${recurrence}
          )
          RETURNING *
        `;

        return json(res, 201, {
          ok: true,
          task: rows[0]
        });

      }


      return methodNotAllowed(res);

    }


    /*
     * TASK INDIVIDUAL
     */

    if (path.startsWith('tasks/')) {

      const id =
        Number(path.split('/')[1]);

      if (!Number.isInteger(id)) {

        return json(res, 400, {
          ok: false,
          error: 'ID inválido'
        });

      }


      if (req.method === 'PUT') {

        const {
          title,
          description,
          due_at,
          completed,
          recurrence
        } = req.body || {};

        /*
         * La repetición necesita dos consultas en lugar de un
         * COALESCE: aquí null significa "deja de repetirse", y
         * COALESCE lo confundiría con "no lo toques". Sin esta
         * separación, completar una tarea le borraría de paso
         * la repetición.
         */

        const rows = recurrence !== undefined

          ? await sql`
              UPDATE tasks

              SET
                title = COALESCE(${title ?? null}, title),
                description = COALESCE(${description ?? null}, description),
                due_at = ${due_at === undefined ? null : due_at},
                completed = COALESCE(${completed ?? null}, completed),
                recurrence = ${recurrence},
                updated_at = NOW()

              WHERE
                id = ${id}
                AND user_id = ${user.id}

              RETURNING *
            `

          : await sql`
              UPDATE tasks

              SET
                title = COALESCE(${title ?? null}, title),
                description = COALESCE(${description ?? null}, description),
                due_at = ${due_at === undefined ? null : due_at},
                completed = COALESCE(${completed ?? null}, completed),
                updated_at = NOW()

              WHERE
                id = ${id}
                AND user_id = ${user.id}

              RETURNING *
            `;

        if (!rows.length) {

          return json(res, 404, {
            ok: false,
            error: 'Tarea no encontrada'
          });

        }

        return json(res, 200, {
          ok: true,
          task: rows[0]
        });

      }


      if (req.method === 'DELETE') {

        const rows = await sql`
          DELETE FROM tasks

          WHERE
            id = ${id}
            AND user_id = ${user.id}

          RETURNING id
        `;

        if (!rows.length) {

          return json(res, 404, {
            ok: false,
            error: 'Tarea no encontrada'
          });

        }

        return json(res, 200, {
          ok: true
        });

      }


      return methodNotAllowed(res);

    }


    /*
     * AJUSTES
     */

    if (path === 'settings') {

      if (req.method === 'GET') {

        const rows = await sql`
          SELECT summary_hour
          FROM users
          WHERE id = ${user.id}
        `;

        return json(res, 200, {
          ok: true,
          settings: {
            summary_hour: rows[0] ? rows[0].summary_hour : null
          }
        });

      }


      if (req.method === 'PUT') {

        const { summary_hour } = req.body || {};

        /*
         * null apaga el resumen diario; un número entre 0 y 23
         * es la hora a la que se quiere recibir.
         */

        const apagar =
          summary_hour === null || summary_hour === '';

        const hora = apagar ? null : Number(summary_hour);

        if (
          !apagar &&
          (!Number.isInteger(hora) || hora < 0 || hora > 23)
        ) {

          return json(res, 400, {
            ok: false,
            error: 'La hora debe estar entre 0 y 23'
          });

        }

        await sql`
          UPDATE users
          SET summary_hour = ${hora}, updated_at = NOW()
          WHERE id = ${user.id}
        `;

        return json(res, 200, {
          ok: true,
          settings: { summary_hour: hora }
        });

      }


      return methodNotAllowed(res);

    }


    /*
     * REMINDERS
     */

    if (path === 'reminders') {

      if (req.method === 'GET') {

        const rows = await sql`
          SELECT *
          FROM reminders

          WHERE
            user_id = ${user.id}

          ORDER BY
            reminder_at ASC
        `;

        return json(res, 200, {
          ok: true,
          reminders: rows
        });

      }


      if (req.method === 'POST') {

        const {
          title,
          reminder_at
        } = req.body || {};

        if (!title || !reminder_at) {

          return json(res, 400, {
            ok: false,
            error: 'Título y fecha son obligatorios'
          });

        }

        const rows = await sql`
          INSERT INTO reminders (
            user_id,
            title,
            reminder_at
          )
          VALUES (
            ${user.id},
            ${String(title).trim()},
            ${reminder_at}
          )
          RETURNING *
        `;

        return json(res, 201, {
          ok: true,
          reminder: rows[0]
        });

      }


      return methodNotAllowed(res);

    }


    /*
     * REMINDER INDIVIDUAL
     */

    if (path.startsWith('reminders/')) {

      const id =
        Number(path.split('/')[1]);

      if (!Number.isInteger(id)) {

        return json(res, 400, {
          ok: false,
          error: 'ID inválido'
        });

      }


      if (req.method === 'DELETE') {

        const rows = await sql`
          DELETE FROM reminders

          WHERE
            id = ${id}
            AND user_id = ${user.id}

          RETURNING id
        `;

        if (!rows.length) {

          return json(res, 404, {
            ok: false,
            error: 'Recordatorio no encontrado'
          });

        }

        return json(res, 200, {
          ok: true
        });

      }


      return methodNotAllowed(res);

    }


    /*
     * SHOPPING
     */

    if (path === 'shopping') {

      if (req.method === 'GET') {

        const rows = await sql`
          SELECT *
          FROM shopping_items

          WHERE
            user_id = ${user.id}

          ORDER BY
            completed ASC,
            created_at DESC
        `;

        return json(res, 200, {
          ok: true,
          shopping: rows
        });

      }


      if (req.method === 'POST') {

        const {
          name
        } = req.body || {};

        if (!name || !String(name).trim()) {

          return json(res, 400, {
            ok: false,
            error: 'El producto es obligatorio'
          });

        }

        const rows = await sql`
          INSERT INTO shopping_items (
            user_id,
            name
          )
          VALUES (
            ${user.id},
            ${String(name).trim()}
          )
          RETURNING *
        `;

        return json(res, 201, {
          ok: true,
          item: rows[0]
        });

      }


      return methodNotAllowed(res);

    }


    /*
     * SHOPPING INDIVIDUAL
     */

    if (path.startsWith('shopping/')) {

      const id =
        Number(path.split('/')[1]);

      if (!Number.isInteger(id)) {

        return json(res, 400, {
          ok: false,
          error: 'ID inválido'
        });

      }


      if (req.method === 'PUT') {

        const {
          name,
          completed
        } = req.body || {};

        const rows = await sql`
          UPDATE shopping_items

          SET
            name = COALESCE(${name ?? null}, name),
            completed = COALESCE(${completed ?? null}, completed),
            updated_at = NOW()

          WHERE
            id = ${id}
            AND user_id = ${user.id}

          RETURNING *
        `;

        if (!rows.length) {

          return json(res, 404, {
            ok: false,
            error: 'Producto no encontrado'
          });

        }

        return json(res, 200, {
          ok: true,
          item: rows[0]
        });

      }


      if (req.method === 'DELETE') {

        const rows = await sql`
          DELETE FROM shopping_items

          WHERE
            id = ${id}
            AND user_id = ${user.id}

          RETURNING id
        `;

        if (!rows.length) {

          return json(res, 404, {
            ok: false,
            error: 'Producto no encontrado'
          });

        }

        return json(res, 200, {
          ok: true
        });

      }


      return methodNotAllowed(res);

    }


    return json(res, 404, {
      ok: false,
      error: 'Ruta API no encontrada'
    });


  } catch (error) {

    const status = error.status || 500;

    /*
     * Una credencial que falta o no vale no es una avería:
     * se registra en una línea, sin traza completa.
     */

    if (status === 500) {
      console.error(error);
    } else {
      console.warn(`${status}: ${error.message}`);
    }

    return json(res, status, {
      ok: false,
      error: error.message || 'Error interno'
    });

  }

};
