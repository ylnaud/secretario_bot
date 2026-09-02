/*
 * FECHAS EN LA ZONA DEL USUARIO
 *
 * El bot vive en un servidor que puede estar en cualquier
 * parte del mundo, pero las horas que escribe el usuario
 * ("mañana a las 9") son las de su reloj, no las del
 * servidor. Este módulo es el único sitio que sabe de zonas
 * horarias, para que el resto del código no tenga que
 * pensarlo.
 *
 * Hay dos formas de mirar una fecha y conviene no mezclarlas:
 *
 *   pared     {year, month, day, hour, minute}
 *             lo que marca el reloj del usuario
 *
 *   instante  Date
 *             un momento exacto, el que se guarda en la
 *             base de datos y se compara con "ahora"
 *
 * La aritmética de calendario (sumar días, meses) se hace
 * sobre la pared usando UTC como vehículo: UTC no tiene
 * cambio de hora, así que sumar un día siempre suma 24 h y
 * nunca aparece una hora que no existe. El salto de horario
 * se aplica al final, al convertir a instante.
 */

const { tzDate, format } = require('@formkit/tempo');

const ZONA =
    process.env.TIMEZONE || 'Atlantic/Canary';


/*
====================================================
PARED ↔ INSTANTE
====================================================
*/

function dosDigitos(numero) {
    return String(numero).padStart(2, '0');
}


/*
   El instante real de una hora de pared, teniendo en
   cuenta si en esa fecha regía el horario de verano.
*/

function aInstante(pared) {

    const texto =
        `${pared.year}-${dosDigitos(pared.month)}-` +
        `${dosDigitos(pared.day)}T` +
        `${dosDigitos(pared.hour)}:${dosDigitos(pared.minute)}`;

    return tzDate(texto, ZONA);
}


/*
   Qué marca el reloj del usuario en un instante dado.
*/

function aPared(instante = new Date()) {

    const texto = format({
        date: instante,
        format: 'YYYY-MM-DD HH:mm',
        tz: ZONA
    });

    const [fecha, hora] = texto.split(' ');
    const [year, month, day] = fecha.split('-').map(Number);
    const [hour, minute] = hora.split(':').map(Number);

    return { year, month, day, hour, minute };
}


function ahora() {
    return aPared(new Date());
}


/*
====================================================
ARITMÉTICA SOBRE LA PARED
====================================================
*/

function aVehiculo(pared) {

    return new Date(Date.UTC(
        pared.year,
        pared.month - 1,
        pared.day,
        pared.hour,
        pared.minute
    ));
}


function desdeVehiculo(fecha) {

    return {
        year: fecha.getUTCFullYear(),
        month: fecha.getUTCMonth() + 1,
        day: fecha.getUTCDate(),
        hour: fecha.getUTCHours(),
        minute: fecha.getUTCMinutes()
    };
}


function sumarDias(pared, dias) {

    const v = aVehiculo(pared);

    v.setUTCDate(v.getUTCDate() + dias);

    return desdeVehiculo(v);
}


function sumarMinutos(pared, minutos) {

    const v = aVehiculo(pared);

    v.setUTCMinutes(v.getUTCMinutes() + minutos);

    return desdeVehiculo(v);
}


/*
   Sumar meses recorta al último día disponible: del 31 de
   enero se pasa al 28 (o 29) de febrero, en vez de saltar
   a marzo como haría Date por su cuenta.
*/

function sumarMeses(pared, meses) {

    const total = (pared.month - 1) + meses;

    const year = pared.year + Math.floor(total / 12);

    const month = ((total % 12) + 12) % 12;

    const ultimoDia =
        new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

    return {
        year,
        month: month + 1,
        day: Math.min(pared.day, ultimoDia),
        hour: pared.hour,
        minute: pared.minute
    };
}


function conHora(pared, hour, minute = 0) {

    return {
        ...pared,
        hour: Number(hour),
        minute: Number(minute)
    };
}


/*
   0 domingo, 1 lunes… igual que Date.getDay().
*/

function diaDeLaSemana(pared) {
    return aVehiculo(pared).getUTCDay();
}


/*
   El próximo día de la semana pedido, siempre futuro:
   si hoy es martes y se pide martes, se va al siguiente.
*/

function proximoDiaSemana(pared, diaBuscado) {

    const actual = diaDeLaSemana(pared);

    let diferencia = (diaBuscado - actual + 7) % 7;

    if (diferencia === 0) {
        diferencia = 7;
    }

    return sumarDias(pared, diferencia);
}


/*
====================================================
COMPARAR Y MOSTRAR
====================================================
*/

function esFutura(pared) {
    return aInstante(pared).getTime() > Date.now();
}


/*
   El día en formato AAAA-MM-DD, según el calendario del
   usuario: a las 00:30 de Canarias ya es el día siguiente
   aunque en el servidor todavía no lo sea.
*/

function diaTexto(pared = ahora()) {

    return `${pared.year}-` +
        `${dosDigitos(pared.month)}-` +
        `${dosDigitos(pared.day)}`;
}


/*
   Comprueba si un instante cae dentro del día indicado.
*/

function esDelDia(instante, pared = ahora()) {

    return diaTexto(aPared(new Date(instante))) ===
        diaTexto(pared);
}


function soloHora(instante) {

    return format({
        date: new Date(instante),
        format: 'HH:mm',
        tz: ZONA
    });
}


function formatear(instante) {

    if (!instante) {
        return 'Sin fecha';
    }

    return format({
        date: new Date(instante),
        format: { date: 'full', time: 'short' },
        tz: ZONA,
        locale: 'es'
    });
}


function formatearCorto(instante) {

    if (!instante) {
        return '';
    }

    return format({
        date: new Date(instante),
        format: 'D MMM HH:mm',
        tz: ZONA,
        locale: 'es'
    });
}


module.exports = {
    ZONA,
    ahora,
    aPared,
    aInstante,
    sumarDias,
    sumarMinutos,
    sumarMeses,
    conHora,
    diaDeLaSemana,
    proximoDiaSemana,
    esFutura,
    diaTexto,
    esDelDia,
    soloHora,
    formatear,
    formatearCorto
};
