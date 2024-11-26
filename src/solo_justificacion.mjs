import dotenv from 'dotenv';
import OpenAI from "openai";
// import * as xlsx from 'xlsx';
import xlsx from 'xlsx';
import pino from 'pino';
import path from 'path';
import { llamarGPTSoloJustificaciones } from './gptUtils.mjs';
import { obtenerArchivosXLSX } from './pdfUtils.mjs';


dotenv.config();
const logger = pino();

// Inicializa la API de OpenAI con la clave desde variables de entorno
const api_key = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: api_key });

const precioI = 2.5 / 1000000;
const precioO = 10 / 1000000;

const excels = obtenerArchivosXLSX();
logger.info(`Archivos excel para justificar: ${excels}`);


for(const excel of excels) {
    logger.info('Se empieza a justificar el excel ' + excel);
    
    await justificarRespuestas(excel);
}

logger.info('Justificación de todos los excels terminada');




async function justificarRespuestas(excel) {
    const targetPath = path.join(__dirname, `target/${excel}`);
    const endPath = path.join(__dirname, `target/resultados_solo_justificacion/justif_${excel}`);
    
    // Leer el archivo Excel
    const libro = xlsx.readFile(targetPath);
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

            // Añado precios
            tokensI += respuestaGPT.usage.prompt_tokens;
            tokensO += respuestaGPT.usage.completion_tokens;
        } catch (error) {
            console.error(`Error al procesar la fila ${i + 1}:`, error.message);
            fila[8] = 'Error al obtener justificación';
        }
    });

    // Esperar a que todas las promesas se completen
    await Promise.all(promesas);

    // Calcular el costo
    logger.info(`Tokens para ${targetPath}: Tokens input: ${tokensI}, Tokens output: ${tokensO}, Tokens totales: ${tokensI + tokensO}`);
    logger.info(`Precios para ${targetPath}: Precio input: ${precioI * tokensI}, Precio output: ${precioO * tokensO}, Precio total: ${precioI * tokensI + precioO * tokensO}`);

    // Convertir los datos de vuelta a hoja de cálculo
    const nuevaHoja = xlsx.utils.aoa_to_sheet(datos);
    const nuevoLibro = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(nuevoLibro, nuevaHoja, 'Resultados');

    // Guardar el archivo Excel modificado
    xlsx.writeFile(nuevoLibro, endPath);
    console.log(`Archivo guardado con justificaciones en: ${endPath}`);
}


// async function justificarRespuestas(excel) {
//     const targetPath = path.join(__dirname, `target/${excel}`);
//     const endPath = path.join(__dirname, `target/resultados_solo_justificacion/justif_${excel}`);
    
//     // Leer el archivo Excel
//     const libro = xlsx.readFile(targetPath);
//     const hoja = libro.Sheets[libro.SheetNames[0]];

//     // Convertir la hoja a JSON para manejar las filas
//     const datos = xlsx.utils.sheet_to_json(hoja, { header: 1 });

//     let tokensI = 0;
//     let tokensO = 0;

//     // Crear una lista de promesas para manejar las llamadas en paralelo
//     const resultados = await Promise.all(
//         datos.slice(1).map(async (fila, i) => {
//             const pregunta = fila[2]; // Columna C
//             const respuestas = [fila[3], fila[4], fila[5], fila[6]]; // Columnas D, E, F y G
//             const respuestaCorrecta = fila[7]; // Columna H

//             try {
//                 const respuestaGPT = await llamarGPTSoloJustificaciones(openai, pregunta, respuestas, respuestaCorrecta);
//                 const justificacion = respuestaGPT.choices[0].message.content;
                
//                 // Añado precios
//                 tokensI += respuestaGPT.usage.prompt_tokens;
//                 tokensO += respuestaGPT.usage.completion_tokens;

//                 return { index: i + 1, fila: [...fila, justificacion] }; // Incluye el índice y la fila completa con la justificación
//             } catch (error) {
//                 console.error(`Error al procesar la fila ${i + 1}:`, error.message);
//                 return { index: i + 1, fila: [...fila, 'Error al obtener justificación'] }; // Incluye un mensaje de error si falla
//             }
//         })
//     );

//     // Reordenar resultados para garantizar el orden original
//     const filasOrdenadas = resultados.sort((a, b) => a.index - b.index).map(r => r.fila);

//     // Calcular el costo
//     logger.info(`Tokens para ${targetPath}: Tokens input: ${tokensI}, Tokens output: ${tokensO}, Tokens totales: ${tokensI + tokensO}`);
//     logger.info(`Precios para ${targetPath}: Precio input: ${precioI * tokensI}, Precio output: ${precioO * tokensO}, Precio total: ${precioI * tokensI + precioO * tokensO}`);

//     // Agregar encabezado de vuelta y convertir los datos a hoja de cálculo
//     const nuevaHoja = xlsx.utils.aoa_to_sheet([datos[0], ...filasOrdenadas]); // Combina encabezado con las filas
//     const nuevoLibro = xlsx.utils.book_new();
//     xlsx.utils.book_append_sheet(nuevoLibro, nuevaHoja, 'Resultados');

//     // Guardar el archivo Excel modificado
//     xlsx.writeFile(nuevoLibro, endPath);
//     console.log(`Archivo guardado con justificaciones en: ${endPath}`);
// }




// const targetPath = path.join(__dirname, 'target/examen.xlsx');
// const endPath = path.join(__dirname, 'target/resultados_solo_justificacion/examen_justificado.xlsx');

// // Llamar a la función
// justificarRespuestas(targetPath, endPath);