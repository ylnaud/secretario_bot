/*
 * SECRETARIO PERSONAL
 * Telegram Mini App V1
 *
 * Esta primera versión contiene la interfaz.
 * En la siguiente fase conectaremos los datos reales
 * de bot.js / backend.
 */


// Telegram Web App

const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
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

let reminders = [];

let shopping = [];


// Actualizar resumen

function updateSummary() {

  document.getElementById("taskCount").textContent =
    tasks.length;

  document.getElementById("reminderCount").textContent =
    reminders.length;

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


function saveTask() {

  const input = document.getElementById("taskInput");

  const date = document.getElementById("taskDate");

  if (!input.value.trim()) {

    alert("Escribe una tarea.");

    return;
  }

  tasks.push({
    id: Date.now(),

    text: input.value.trim(),

    date: date.value
  });

  updateSummary();

  renderTasks();

  closeModal();

  notify("Tarea creada ✅");
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

      <div class="action">

        <span>📋</span>

        <div>
          <strong>${escapeHTML(task.text)}</strong>

          <small>
            ${task.date || "Sin fecha"}
          </small>
        </div>

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

      <div class="action">

        <span>📋</span>

        <div>
          <strong>${escapeHTML(task.text)}</strong>

          <small>
            ${task.date || "Sin fecha"}
          </small>
        </div>

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


function saveReminder() {

  const text =
    document.getElementById("reminderInput").value.trim();

  const time =
    document.getElementById("reminderTime").value;

  if (!text) {

    alert("Escribe qué quieres recordar.");

    return;
  }

  reminders.push({
    id: Date.now(),
    text,
    time
  });

  updateSummary();

  closeModal();

  notify("Recordatorio creado ⏰");
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


function saveShopping() {

  const input =
    document.getElementById("shoppingInput");

  if (!input.value.trim()) {

    alert("Escribe un producto.");

    return;
  }

  shopping.push({
    id: Date.now(),

    text: input.value.trim()
  });

  updateSummary();

  renderShoppingMain();

  closeModal();

  notify("Producto añadido 🛒");
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

      <div class="action">

        <span>🛒</span>

        <div>
          <strong>${escapeHTML(item.text)}</strong>
          <small>Pendiente</small>
        </div>

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

      <div class="action">

        <span>🛒</span>

        <div>
          <strong>${escapeHTML(item.text)}</strong>
          <small>Pendiente</small>
        </div>

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


// Inicializar

renderTasks();

renderShoppingMain();

updateSummary();
