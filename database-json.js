const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'database.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function createEmptyDatabase() {
    return {
        tasks: [],
        shopping: [],
        nextTaskId: 1,
        nextShoppingId: 1
    };
}

function load() {
    if (!fs.existsSync(FILE)) {
        const data = createEmptyDatabase();
        save(data);
        return data;
    }

    try {
        return JSON.parse(
            fs.readFileSync(FILE, 'utf8')
        );
    } catch (error) {
        console.error(
            '⚠️ Base de datos dañada. Creando una nueva.'
        );

        const data = createEmptyDatabase();
        save(data);

        return data;
    }
}

function save(data) {
    const temporary = `${FILE}.tmp`;

    fs.writeFileSync(
        temporary,
        JSON.stringify(data, null, 2),
        'utf8'
    );

    fs.renameSync(
        temporary,
        FILE
    );
}

function addTask(text, dueAt = null) {

    const data = load();

    const task = {
        id: data.nextTaskId++,
        text,
        due_at: dueAt,
        done: false,
        notified: false,
        created_at: new Date().toISOString()
    };

    data.tasks.push(task);

    save(data);

    return task;
}

function getPendingTasks() {

    const data = load();

    return data.tasks
        .filter(task => !task.done)
        .sort((a, b) => {

            if (!a.due_at && !b.due_at) {
                return b.id - a.id;
            }

            if (!a.due_at) return 1;
            if (!b.due_at) return -1;

            return new Date(a.due_at) -
                   new Date(b.due_at);
        });
}

function getDueTasks() {

    const data = load();

    const now = Date.now();

    return data.tasks.filter(task => {

        if (task.done) return false;
        if (task.notified) return false;
        if (!task.due_at) return false;

        return new Date(task.due_at).getTime() <= now;
    });
}

function markNotified(id) {

    const data = load();

    const task = data.tasks.find(
        task => task.id === Number(id)
    );

    if (!task) return false;

    task.notified = true;

    save(data);

    return true;
}

function completeTask(id) {

    const data = load();

    const task = data.tasks.find(
        task => task.id === Number(id)
    );

    if (!task) return false;

    task.done = true;

    save(data);

    return true;
}

function deleteTask(id) {

    const data = load();

    data.tasks = data.tasks.filter(
        task => task.id !== Number(id)
    );

    save(data);
}

function addShopping(item) {

    const data = load();

    const product = {
        id: data.nextShoppingId++,
        item,
        done: false,
        created_at: new Date().toISOString()
    };

    data.shopping.push(product);

    save(data);

    return product;
}

function getShopping() {

    const data = load();

    return data.shopping.filter(
        item => !item.done
    );
}

function completeShopping(id) {

    const data = load();

    const item = data.shopping.find(
        item => item.id === Number(id)
    );

    if (!item) return false;

    item.done = true;

    save(data);

    return true;
}

function deleteShopping(id) {

    const data = load();

    data.shopping = data.shopping.filter(
        item => item.id !== Number(id)
    );

    save(data);
}

function getStats() {

    const data = load();

    return {
        totalTasks: data.tasks.length,

        pendingTasks:
            data.tasks.filter(
                task => !task.done
            ).length,

        completedTasks:
            data.tasks.filter(
                task => task.done
            ).length,

        pendingShopping:
            data.shopping.filter(
                item => !item.done
            ).length
    };
}

module.exports = {
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
