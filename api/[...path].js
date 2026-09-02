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
   * Al ser una ruta catch-all, Vercel entrega los segmentos
   * de la URL en req.query.path (por ejemplo ['tasks', '5']).
   * Si no vienen, se deduce de req.url.
   */

  const fromQuery = req.query && req.query.path;

  if (Array.isArray(fromQuery)) {
    return fromQuery.join('/');
  }

  if (typeof fromQuery === 'string' && fromQuery) {
    return fromQuery;
  }

  const raw = req.url || '';

  const clean = raw.split('?')[0];

  return clean.replace(/^\/api\/?/, '');

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
     */

    if (path === 'health') {

      return json(res, 200, {
        ok: true,
        service: 'secretario-api',
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
          due_at = null
        } = req.body || {};

        if (!title || !String(title).trim()) {

          return json(res, 400, {
            ok: false,
            error: 'El título es obligatorio'
          });

        }

        const rows = await sql`
          INSERT INTO tasks (
            user_id,
            title,
            description,
            due_at
          )
          VALUES (
            ${user.id},
            ${String(title).trim()},
            ${description},
            ${due_at || null}
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
          completed
        } = req.body || {};

        const rows = await sql`
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
