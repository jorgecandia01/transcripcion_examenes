const xlsx = require('xlsx');
const { llamarGPTSoloJustificaciones } = require('./gptUtils.js');
const { config } = require('./config/config.js');
const { iniciarMedicion, obtenerDuracionMs, formatearDuracionMs } = require('./timeUtils.js');

module.exports = {
    iniciarJustificacion,
}


async function iniciarJustificacion(files, openai){
    const inicioPeticion = iniciarMedicion();
    // const excels = obtenerArchivosXLSX();
    // const excels = files.map(file => file.path);
    const excels = files;
    console.log(`Archivos Excel para justificar: ${excels.map((excel) => excel.originalname).join(', ')}`);

    const resultados = [];
    const errores = [];
    const tiemposExamenes = [];
    const costesExamenes = [];
    let totalCostUsd = 0;

    for(const excel of excels) {
        const inicioExamen = iniciarMedicion();
        console.log(`Se empieza a justificar el Excel ${excel.originalname}`);

        try {
            const { content, costUsd } = await justificarRespuestas(excel.path, openai);
            const name = `justif_${excel.originalname}`;
            resultados.push({ name, content });
            totalCostUsd += costUsd;
            costesExamenes.push({ name: excel.originalname, costUsd });
            const duracionMs = Math.round(obtenerDuracionMs(inicioExamen));
            tiemposExamenes.push({ name: excel.originalname, durationMs: duracionMs });
            console.log(`Examen ${excel.originalname} completado en ${formatearDuracionMs(duracionMs)}.`);
        } catch (error) {
            const duracionMs = Math.round(obtenerDuracionMs(inicioExamen));
            const message = error instanceof Error ? error.message : String(error);
            errores.push({ name: excel.originalname, message, durationMs: duracionMs });
            console.error(`Error al procesar el examen ${excel.originalname}. Se continúa con el siguiente:`, error);
        }
    }
    
    console.log('Justificación de todos los excels terminada');
    const duracionTotalMs = Math.round(obtenerDuracionMs(inicioPeticion));
    if (excels.length > 1) {
        console.log(`Petición completa de ${excels.length} exámenes terminada en ${formatearDuracionMs(duracionTotalMs)}.`);
    }
    return {
        resultFiles: resultados,
        errors: errores,
        timing: { totalMs: duracionTotalMs, attemptedCount: excels.length, exams: tiemposExamenes },
        cost: { totalUsd: totalCostUsd, exams: costesExamenes },
    };
}



async function justificarRespuestas(excel, openai) {
    const libro = xlsx.readFile(excel);
    const hoja = libro.Sheets[libro.SheetNames[0]];

    // Convertir la hoja a JSON para manejar las filas
    const datos = xlsx.utils.sheet_to_json(hoja, { header: 1 });

    let tokensI = 0;
    let tokensO = 0;

    // Crear una lista de promesas para manejar las llamadas en paralelo
    const promesas = datos.slice(1).map(async (fila, i) => { // .slice(1) para quitar las cabeceras
        const pregunta = fila[2]; // Columna C
        const respuestas = [fila[3], fila[4], fila[5], fila[6]]; // Columnas D, E, F y G
        const respuestaCorrecta = fila[7]; // Columna H

        try {
            const respuestaGPT = await llamarGPTSoloJustificaciones(openai, pregunta, respuestas, respuestaCorrecta);
            const justificacion = respuestaGPT.choices[0].message.content;
            fila[8] = justificacion; // Agregar la justificación a la columna I

            console.log(`Se ha justificado la fila ${i+1}. Se han utilizado ${respuestaGPT.usage.prompt_tokens + respuestaGPT.usage.completion_tokens} tokens`);

            // Añado precios
            tokensI += respuestaGPT.usage.prompt_tokens;
            tokensO += respuestaGPT.usage.completion_tokens;
        } catch (error) {
            console.log(`Error al procesar la fila ${i + 1}:`, error.message);
            console.log(`Error al procesar la fila ${i + 1}:`, error.message);
            fila[8] = 'Error al obtener justificación';
        }
    });

    // Esperar a que todas las promesas se completen
    await Promise.all(promesas);

    const inputCostUsd = config.openai.inputPricePerToken * tokensI;
    const outputCostUsd = config.openai.outputPricePerToken * tokensO;
    const costUsd = inputCostUsd + outputCostUsd;
    console.log(`Tokens para ${excel}: Tokens input: ${tokensI}, Tokens output: ${tokensO}, Tokens totales: ${tokensI + tokensO}`);
    console.log(`Coste estimado para ${excel}: input $${inputCostUsd.toFixed(2)} USD, output $${outputCostUsd.toFixed(2)} USD, total $${costUsd.toFixed(2)} USD`);

    // Convertir los datos de vuelta a hoja de cálculo
    const nuevaHoja = xlsx.utils.aoa_to_sheet(datos);
    const nuevoLibro = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(nuevoLibro, nuevaHoja, 'Resultados');

    // Generar el buffer del archivo Excel modificado
    const buffer = xlsx.write(nuevoLibro, { bookType: 'xlsx', type: 'buffer' });

    return { content: buffer, costUsd };
}
