function iniciarMedicion() {
    return process.hrtime.bigint();
}

function formatearDuracion(inicio) {
    const segundosTotales = Number(process.hrtime.bigint() - inicio) / 1e9;

    if (segundosTotales < 60) return `${segundosTotales.toFixed(1)} s`;

    const minutos = Math.floor(segundosTotales / 60);
    const segundos = (segundosTotales % 60).toFixed(1);
    return `${minutos} min ${segundos} s`;
}

module.exports = { iniciarMedicion, formatearDuracion };
