/*
 * SERVIDOR WEB DEL BOT
 *
 * Sirve las tres cosas desde el mismo sitio y el mismo dominio:
 *
 *   /            → la Mini App (miniapp/index.html)
 *   /style.css   → los archivos de la Mini App
 *   /api/...     → la API, el mismo handler que usaba Vercel
 *   /health      → comprobación de vida
 *
 * Que todo comparta dominio evita configurar CORS: la Mini App
 * llama a su propio origen.
 *
 * Solo arranca si existe PORT, que definen Render y similares.
 * En Termux no se abre nada y el bot funciona como siempre.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const MINIAPP_DIR = path.join(__dirname, 'miniapp');

const MAX_BODY_BYTES = 100 * 1024;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon'
};


function sendJson(response, status, data) {

    response.statusCode = status;

    response.setHeader(
        'Content-Type',
        'application/json; charset=utf-8'
    );

    response.end(JSON.stringify(data));
}


/*
====================================================
CUERPO DE LA PETICIÓN
====================================================

El handler de la API espera req.body ya convertido a
objeto, como se lo daba Vercel.
*/

function readJsonBody(request) {

    return new Promise((resolve, reject) => {

        let raw = '';

        request.on('data', chunk => {

            raw += chunk;

            if (raw.length > MAX_BODY_BYTES) {

                reject(new Error('Petición demasiado grande'));

                request.destroy();
            }
        });

        request.on('end', () => {

            if (!raw) {
                resolve(null);
                return;
            }

            try {
                resolve(JSON.parse(raw));
            } catch (error) {
                reject(new Error('El cuerpo no es JSON válido'));
            }
        });

        request.on('error', reject);
    });
}


/*
====================================================
API
====================================================

api/index.js está escrito para Vercel, así que espera
res.status().json() y req.query. Se los añadimos aquí
en vez de tocar el handler, para que siga sirviendo en
los dos sitios.
*/

async function handleApi(request, response, pathname) {

    const handler = require('./api/index.js');

    try {

        if (
            request.method === 'POST' ||
            request.method === 'PUT'
        ) {
            request.body = await readJsonBody(request);
        }

    } catch (error) {

        sendJson(response, 400, {
            ok: false,
            error: error.message
        });

        return;
    }

    request.query = {
        path: pathname.replace(/^\/api\/?/, '')
    };

    response.status = function (code) {
        this.statusCode = code;
        return this;
    };

    response.json = function (data) {
        this.setHeader(
            'Content-Type',
            'application/json; charset=utf-8'
        );
        this.end(JSON.stringify(data));
        return this;
    };

    await handler(request, response);
}


/*
====================================================
ARCHIVOS DE LA MINI APP
====================================================
*/

function serveStatic(response, pathname) {

    const relative =
        pathname === '/'
            ? 'index.html'
            : decodeURIComponent(pathname).replace(/^\/+/, '');

    const file = path.resolve(MINIAPP_DIR, relative);

    /*
       Sin esta comprobación, una ruta como /../bot.js
       serviría archivos de fuera de miniapp/.
    */

    if (
        file !== MINIAPP_DIR &&
        !file.startsWith(MINIAPP_DIR + path.sep)
    ) {

        sendJson(response, 403, {
            ok: false,
            error: 'Ruta no permitida'
        });

        return;
    }

    fs.readFile(file, (error, content) => {

        if (error) {

            sendJson(response, 404, {
                ok: false,
                error: 'No encontrado'
            });

            return;
        }

        response.statusCode = 200;

        response.setHeader(
            'Content-Type',
            MIME_TYPES[path.extname(file)] ||
                'application/octet-stream'
        );

        response.end(content);
    });
}


/*
====================================================
ARRANQUE
====================================================
*/

function start() {

    const port = process.env.PORT;

    if (!port) {
        return null;
    }

    const server = http.createServer(async (request, response) => {

        const pathname =
            new URL(
                request.url,
                'http://localhost'
            ).pathname;

        try {

            if (
                pathname === '/api' ||
                pathname.startsWith('/api/')
            ) {

                await handleApi(request, response, pathname);

                return;
            }

            if (pathname === '/health') {

                sendJson(response, 200, {
                    ok: true,
                    service: 'secretario-bot',
                    uptime: Math.round(process.uptime()),
                    time: new Date().toISOString()
                });

                return;
            }

            serveStatic(response, pathname);

        } catch (error) {

            console.error(
                '❌ Error atendiendo la petición:',
                error.message
            );

            if (!response.headersSent) {

                sendJson(response, 500, {
                    ok: false,
                    error: 'Error interno'
                });
            }
        }
    });

    server.listen(port, () => {

        console.log(
            `🌐 Web y API escuchando en el puerto ${port}`
        );
    });

    return server;
}


module.exports = { start };
