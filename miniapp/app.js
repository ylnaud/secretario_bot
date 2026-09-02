/*
 * SECRETARIO PERSONAL
 * Telegram Mini App V2
 *
 * Conectado con API Backend
 */

// Configuración API
const API_URL = window.location.origin;

// Telegram Web App
const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

// Estado de sincronización
let isLoading = false;
let lastError = null;

// Obtener header de autenticación de Telegram
async function getApiHeaders() {
  const initData = tg?.initData || '';

  return {
    'Content-Type': 'application/json',
    'x-telegram-init-data': initData
  };
}

// Función genérica para llamadas API
async function apiCall(endpoint, options = {}) {

  try {
    const headers = await getApiHeaders();

    const response = await fetch(
      `${API_URL}/api/${endpoint}`,
      {
        ...options,
        headers: {
          ...headers,
          ...options.headers
        }
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Error ${response.status}`);
    }

    return await response.json();

  } catch (error) {
    console.error(`Error en ${endpoint}:`, error);
    lastError = error.message;
    throw error;
  }
}


// Fecha

function updateDate() {

  const dateElement = document.getElementById("date");

  const now = new Date();

  const text = now.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });

  dateElement.textContent =
    text.charAt(0).toUpperCase() + text.slice(1);
}

updateDate();


// Datos temporales

let tasks = [];

let shopping = [];


// Actualizar resumen

function updateSummary() {

  document.getElementById("taskCount").textContent =
    tasks.length;

  /*
     Los recordatorios no son una lista aparte: son las
     tareas que tienen fecha y hora de aviso.
  */

  document.getElementById("reminderCount").textContent =
    tasks.filter(t => t.due_at).length;

  document.getElementById("shoppingCount").textContent =
    shopping.length;
}

updateSummary();


// Modal

function openModal(title, content) {

  document.getElementById("modalTitle").textContent = title;

  document.getElementById("modalContent").innerHTML = content;

  document.getElementById("modal").classList.remove("hidden");
}


function closeModal() {

  document.getElementById("modal").classList.add("hidden");
}


function closeModalAndReset() {

  closeModal();

  setActiveNav(document.querySelectorAll(".nav-item")[0]);
}


// Nueva tarea

function newTask() {

  openModal(
    "➕ Nueva tarea",

    `
      <div class="form-group">
        <label>¿Qué tienes que hacer?</label>

        <input
          id="taskInput"
          type="text"
          placeholder="Ej. Comprar comida para los animales"
          autocomplete="off"
        >
      </div>

      <div class="form-group">
        <label>Fecha</label>

        <input
          id="taskDate"
          type="date"
        >
      </div>

      <button
        class="form-button"
        onclick="saveTask()"
      >
        Crear tarea
      </button>
    `
  );
}


async function saveTask() {

  const input = document.getElementById("taskInput");
  const date = document.getElementById("taskDate");

  if (!input.value.trim()) {
    notify("Escribe una tarea.");
    return;
  }

  try {
    isLoading = true;

    /*
       Con día pero sin hora, el aviso va a las 9:00 de la
       mañana igual que en el bot. Sin esto se guardaría a
       medianoche UTC y sonaría de madrugada.
    */

    const cuando = date.value
      ? new Date(`${date.value}T09:00`)
      : null;

    const response = await apiCall('tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: input.value.trim(),
        due_at: cuando ? cuando.toISOString() : null
      })
    });

    const newTask = response.task;

    tasks.push({
      id: newTask.id,
      text: newTask.title,
      date: cuando ? cuando.toLocaleDateString('es-ES') : '',
      due_at: newTask.due_at,
      recurrence: newTask.recurrence
    });

    updateSummary();
    renderTasks();
    closeModal();
    notify("Tarea creada ✅");

  } catch (error) {
    notify(`Error: ${error.message}`);
  } finally {
    isLoading = false;
  }
}


// Mostrar tareas

function showTasks() {

  openModal(
    "📋 Mis tareas",

    `
      <div id="modalTasks"></div>

      <button
        class="form-button"
        onclick="newTask()"
      >
        ➕ Nueva tarea
      </button>
    `
  );

  setActiveNav(document.querySelectorAll(".nav-item")[1]);

  renderModalTasks();
}


function renderModalTasks() {

  const container =
    document.getElementById("modalTasks");

  if (!container) return;

  if (tasks.length === 0) {

    container.innerHTML = `
      <div class="empty small">
        <div>📭</div>
        <p>No tienes tareas.</p>
      </div>
    `;

    return;
  }

  container.innerHTML =
    tasks.map(task => `

      <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
        <div class="action" style="flex: 1;">
          <span>📋</span>
          <div>
            <strong>${escapeHTML(task.text)}</strong>
            <small>${task.date || "Sin fecha"}${recurrenceLabel(task.recurrence)}</small>
          </div>
        </div>
        <button onclick="completeTaskFromUI(${task.id})" title="Completar" style="
          background: #10b981;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 12px;
          white-space: nowrap;
        ">✅</button>
        <button onclick="deleteTaskFromUI(${task.id})" title="Eliminar" style="
          background: #ef4444;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 12px;
          white-space: nowrap;
        ">🗑️</button>
      </div>

    `).join("");
}


// Render principal

function renderTasks() {

  const container =
    document.getElementById("tasks");

  if (!container) return;

  if (tasks.length === 0) {

    container.innerHTML = `
      <div class="empty">
        <div>📭</div>
        <p>No tienes tareas todavía</p>

        <button onclick="newTask()">
          Crear tarea
        </button>
      </div>
    `;

    return;
  }

  container.innerHTML =
    tasks.slice(0, 5).map(task => `

      <div style="display: flex; gap: 8px; margin-bottom: 8px;">
        <div class="action" style="flex: 1;">
          <span>📋</span>
          <div>
            <strong>${escapeHTML(task.text)}</strong>
            <small>${task.date || "Sin fecha"}${recurrenceLabel(task.recurrence)}</small>
          </div>
        </div>
        <button onclick="completeTaskFromUI(${task.id})" style="
          background: #10b981;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 12px;
        ">✅</button>
        <button onclick="deleteTaskFromUI(${task.id})" style="
          background: #ef4444;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 12px;
        ">🗑️</button>
      </div>

    `).join("");
}


// Recordatorio

function newReminder() {

  openModal(
    "⏰ Nuevo recordatorio",

    `
      <div class="form-group">

        <label>¿Qué quieres recordar?</label>

        <input
          id="reminderInput"
          type="text"
          placeholder="Ej. Llamar al jefe"
          autocomplete="off"
        >

      </div>

      <div class="form-group">

        <label>Día</label>

        <input
          id="reminderDate"
          type="date"
        >

      </div>

      <div class="form-group">

        <label>Hora</label>

        <input
          id="reminderTime"
          type="time"
        >

      </div>

      <button
        class="form-button"
        onclick="saveReminder()"
      >
        Crear recordatorio
      </button>
    `
  );
}


/*
 * Un recordatorio es una tarea con fecha y hora: es lo que
 * vigila el bot para avisarte. Si se guardara en la tabla
 * "reminders" nadie lo miraría y el aviso no llegaría nunca.
 */

async function saveReminder() {

  const text =
    document.getElementById("reminderInput").value.trim();

  const day =
    document.getElementById("reminderDate").value;

  const time =
    document.getElementById("reminderTime").value;

  if (!text) {
    notify("Escribe qué quieres recordar.");
    return;
  }

  if (!day || !time) {
    notify("Pon el día y la hora del aviso.");
    return;
  }

  const cuando = new Date(`${day}T${time}`);

  if (cuando <= new Date()) {
    notify("Esa fecha ya pasó. Elige una futura.");
    return;
  }

  try {
    isLoading = true;

    const response = await apiCall('tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: text,
        due_at: cuando.toISOString()
      })
    });

    const creada = response.task;

    tasks.push({
      id: creada.id,
      text: creada.title,
      date: cuando.toLocaleDateString('es-ES'),
      due_at: creada.due_at,
      recurrence: creada.recurrence
    });

    updateSummary();
    renderTasks();
    closeModal();
    notify("Recordatorio creado ⏰");

  } catch (error) {
    notify(`Error: ${error.message}`);
  } finally {
    isLoading = false;
  }
}


// Compras

function showShopping() {

  openModal(
    "🛒 Lista de compras",

    `
      <div id="shoppingModal"></div>

      <div style="height:12px"></div>

      <button
        class="form-button"
        onclick="addShopping()"
      >
        ➕ Añadir producto
      </button>
    `
  );

  setActiveNav(document.querySelectorAll(".nav-item")[3]);

  renderShopping();
}


function addShopping() {

  openModal(
    "🛒 Añadir compra",

    `
      <div class="form-group">

        <label>Producto</label>

        <input
          id="shoppingInput"
          type="text"
          placeholder="Ej. Leche"
          autocomplete="off"
        >

      </div>

      <button
        class="form-button"
        onclick="saveShopping()"
      >
        Añadir
      </button>
    `
  );
}


async function saveShopping() {

  const input = document.getElementById("shoppingInput");

  if (!input.value.trim()) {
    notify("Escribe un producto.");
    return;
  }

  try {
    isLoading = true;

    const response = await apiCall('shopping', {
      method: 'POST',
      body: JSON.stringify({
        name: input.value.trim()
      })
    });

    const newItem = response.item;

    shopping.push({
      id: newItem.id,
      text: newItem.name
    });

    updateSummary();
    renderShoppingMain();
    closeModal();
    notify("Compra añadida ✅");

  } catch (error) {
    notify(`Error: ${error.message}`);
  } finally {
    isLoading = false;
  }
}


function renderShopping() {

  const container =
    document.getElementById("shoppingModal");

  if (!container) return;

  if (shopping.length === 0) {

    container.innerHTML = `
      <div class="empty small">
        <div>🛒</div>
        <p>Tu lista está vacía.</p>
      </div>
    `;

    return;
  }

  container.innerHTML =
    shopping.map(item => `

      <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
        <div class="action" style="flex: 1;">
          <span>🛒</span>
          <div>
            <strong>${escapeHTML(item.text)}</strong>
            <small>Pendiente</small>
          </div>
        </div>
        <button onclick="completeShoppingFromUI(${item.id})" title="Completar" style="
          background: #10b981;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 12px;
          white-space: nowrap;
        ">✅</button>
        <button onclick="deleteShoppingFromUI(${item.id})" title="Eliminar" style="
          background: #ef4444;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 12px;
          white-space: nowrap;
        ">🗑️</button>
      </div>

    `).join("");
}


function renderShoppingMain() {

  const container =
    document.getElementById("shopping");

  if (!container) return;

  if (shopping.length === 0) {

    container.innerHTML = `
      <div class="empty small">
        <div>🛒</div>
        <p>Tu lista está vacía</p>
      </div>
    `;

    return;
  }

  container.innerHTML =
    shopping.slice(0, 5).map(item => `

      <div style="display: flex; gap: 8px; margin-bottom: 8px;">
        <div class="action" style="flex: 1;">
          <span>🛒</span>
          <div>
            <strong>${escapeHTML(item.text)}</strong>
            <small>Pendiente</small>
          </div>
        </div>
        <button onclick="completeShoppingFromUI(${item.id})" style="
          background: #10b981;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 12px;
        ">✅</button>
        <button onclick="deleteShoppingFromUI(${item.id})" style="
          background: #ef4444;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 12px;
        ">🗑️</button>
      </div>

    `).join("");
}


// Navegación activa

function setActiveNav(button) {
  document.querySelectorAll(".nav-item").forEach(item => {
    item.classList.remove("active");
  });

  if (button) {
    button.classList.add("active");
  }
}


// Inicio

function home() {

  closeModal();

  setActiveNav(document.querySelectorAll(".nav-item")[0]);

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


// Ajustes

function showSettings() {

  openModal(
    "⚙️ Ajustes",

    `
      <div class="empty small">

        <div>⚙️</div>

        <p>
          Los ajustes estarán disponibles
          en una próxima versión.
        </p>

      </div>
    `
  );

  setActiveNav(document.querySelectorAll(".nav-item")[4]);
}


// Notificación

function notify(message) {

  if (tg?.showPopup) {

    tg.showPopup({
      title: "Secretario",
      message: message,
      buttons: [
        {
          type: "ok"
        }
      ]
    });

  } else {

    alert(message);

  }
}


// Seguridad básica para texto HTML

function escapeHTML(text) {

  const div = document.createElement("div");

  div.textContent = text;

  return div.innerHTML;
}


// Texto de la repetición

function recurrenceLabel(recurrence) {

  if (recurrence === 'daily') return ' · 🔁 cada día';
  if (recurrence === 'weekly') return ' · 🔁 cada semana';
  if (recurrence === 'monthly') return ' · 🔁 cada mes';

  return '';
}


// Funciones de API para completar/eliminar

async function completeTaskFromUI(taskId) {

  try {
    await apiCall(`tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify({ completed: true })
    });

    tasks = tasks.filter(t => t.id !== taskId);
    updateSummary();
    renderTasks();
    notify('Tarea completada ✅');

  } catch (error) {
    notify(`Error: ${error.message}`);
  }
}

async function deleteTaskFromUI(taskId) {

  try {
    await apiCall(`tasks/${taskId}`, {
      method: 'DELETE'
    });

    tasks = tasks.filter(t => t.id !== taskId);
    updateSummary();
    renderTasks();
    notify('Tarea eliminada 🗑️');

  } catch (error) {
    notify(`Error: ${error.message}`);
  }
}

async function completeShoppingFromUI(itemId) {

  try {
    await apiCall(`shopping/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ completed: true })
    });

    shopping = shopping.filter(s => s.id !== itemId);
    updateSummary();
    renderShoppingMain();
    notify('Compra marcada como completada ✅');

  } catch (error) {
    notify(`Error: ${error.message}`);
  }
}

async function deleteShoppingFromUI(itemId) {

  try {
    await apiCall(`shopping/${itemId}`, {
      method: 'DELETE'
    });

    shopping = shopping.filter(s => s.id !== itemId);
    updateSummary();
    renderShoppingMain();
    notify('Compra eliminada 🗑️');

  } catch (error) {
    notify(`Error: ${error.message}`);
  }
}

// Cargar datos iniciales desde API

async function loadData() {

  /*
   * Sin initData la API no puede identificar al usuario.
   * Pasa siempre que se abre la página en un navegador normal
   * en vez de desde el botón del bot.
   */

  if (!tg?.initData) {

    document.getElementById("tasks").innerHTML = `
      <div class="empty">
        <div>🔒</div>
        <p>Abre esta app desde tu bot de Telegram</p>
      </div>
    `;

    return;
  }

  try {
    isLoading = true;

    const [tasksData, shoppingData] = await Promise.all([
      apiCall('tasks'),
      apiCall('shopping')
    ]);

    tasks = (tasksData.tasks || [])
      .filter(t => !t.completed)
      .map(t => ({
        id: t.id,
        text: t.title,
        date: t.due_at ? new Date(t.due_at).toLocaleDateString('es-ES') : '',
        due_at: t.due_at,
        recurrence: t.recurrence
      }));

    shopping = (shoppingData.shopping || [])
      .filter(s => !s.completed)
      .map(s => ({
        id: s.id,
        text: s.name
      }));

    updateSummary();
    renderTasks();
    renderShoppingMain();

  } catch (error) {
    console.error('Error cargando datos:', error);
    notify('⚠️ No se pudieron cargar los datos del servidor');
  } finally {
    isLoading = false;
  }
}

// Inicializar

loadData();
