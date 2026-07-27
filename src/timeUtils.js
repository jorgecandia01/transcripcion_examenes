function iniciarMedicion() {
    return process.hrtime.bigint();
}

function obtenerDuracionMs(inicio) {
    return Number(process.hrtime.bigint() - inicio) / 1e6;
}

function formatearDuracionMs(duracionMs) {
    const segundosTotales = duracionMs / 1000;

    if (segundosTotales < 60) return `${segundosTotales.toFixed(1)} s`;

    const minutos = Math.floor(segundosTotales / 60);
    const segundos = (segundosTotales % 60).toFixed(1);
    return `${minutos} min ${segundos} s`;
}

module.exports = { iniciarMedicion, obtenerDuracionMs, formatearDuracionMs };
