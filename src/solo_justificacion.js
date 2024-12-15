const xlsx = require('xlsx');
const path = require('path');
const { llamarGPTSoloJustificaciones } = require('./gptUtils.js');

const precioI = 2.5 / 1000000;
const precioO = 10 / 1000000;

module.exports = {
    iniciarJustificacion,
}


async function iniciarJustificacion(files, openai){
    // const excels = obtenerArchivosXLSX();
    // const excels = files.map(file => file.path);
    const excels = files;
    console.log(`Archivos excel para justificar: ${excels}`);

    const resultados = [];

    for(const excel of excels) {
        console.log('Se empieza a justificar el excel ' + excel);
        
        // await justificarRespuestas(excel, openai);
        const result = await justificarRespuestas(excel['path'], openai);
        // const name = `justificacion_resultados_${Date.now()}.xlsx`;
        const name = `justif_${excel['originalname']}`;
        resultados.push({ name, content: result });
    }
    
    console.log('Justificación de todos los excels terminada');
    return resultados;
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

    // Calcular el costo
    console.log(`Tokens para ${excel}: Tokens input: ${tokensI}, Tokens output: ${tokensO}, Tokens totales: ${tokensI + tokensO}`);
    console.log(`Precios para ${excel}: Precio input: ${precioI * tokensI}, Precio output: ${precioO * tokensO}, Precio total: ${precioI * tokensI + precioO * tokensO}`);

    // Convertir los datos de vuelta a hoja de cálculo
    const nuevaHoja = xlsx.utils.aoa_to_sheet(datos);
    const nuevoLibro = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(nuevoLibro, nuevaHoja, 'Resultados');

    // Generar el buffer del archivo Excel modificado
    const buffer = xlsx.write(nuevoLibro, { bookType: 'xlsx', type: 'buffer' });

    return buffer;
}

