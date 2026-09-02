CREATE TABLE IF NOT EXISTS users (

  id SERIAL PRIMARY KEY,

  telegram_id VARCHAR(64) NOT NULL UNIQUE,

  first_name VARCHAR(100),

  last_name VARCHAR(100),

  username VARCHAR(100),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


CREATE TABLE IF NOT EXISTS tasks (

  id SERIAL PRIMARY KEY,

  user_id INTEGER NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  title TEXT NOT NULL,

  description TEXT,

  due_at TIMESTAMPTZ,

  completed BOOLEAN NOT NULL DEFAULT FALSE,

  notified BOOLEAN NOT NULL DEFAULT FALSE,

  /*
     Cómo se repite la tarea: daily, weekly, monthly o
     NULL si solo ocurre una vez. La siguiente fecha se
     calcula desde due_at, así que no hace falta guardar
     el día de la semana ni del mes.
  */

  recurrence VARCHAR(20),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


/*
   La columna se añade aparte para las bases que ya
   existían antes de haber tareas recurrentes.
*/

ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS recurrence VARCHAR(20);


CREATE INDEX IF NOT EXISTS tasks_user_id_idx
ON tasks(user_id);


CREATE INDEX IF NOT EXISTS tasks_due_at_idx
ON tasks(due_at);


CREATE TABLE IF NOT EXISTS reminders (

  id SERIAL PRIMARY KEY,

  user_id INTEGER NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  title TEXT NOT NULL,

  reminder_at TIMESTAMPTZ NOT NULL,

  notified BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


CREATE INDEX IF NOT EXISTS reminders_user_id_idx
ON reminders(user_id);


CREATE INDEX IF NOT EXISTS reminders_reminder_at_idx
ON reminders(reminder_at);


CREATE TABLE IF NOT EXISTS shopping_items (

  id SERIAL PRIMARY KEY,

  user_id INTEGER NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  name TEXT NOT NULL,

  completed BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


CREATE INDEX IF NOT EXISTS shopping_user_id_idx
ON shopping_items(user_id);
