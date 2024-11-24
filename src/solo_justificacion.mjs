import dotenv from 'dotenv';
import OpenAI from "openai";
// import * as xlsx from 'xlsx';
import xlsx from 'xlsx';
import pino from 'pino';
import path from 'path';
import { llamarGPTSoloJustificaciones } from './gptUtils.mjs';


dotenv.config();
const logger = pino();

// Inicializa la API de OpenAI con la clave desde variables de entorno
const api_key = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: api_key });

const precioI = 2.5 / 1000000;
const precioO = 10 / 1000000;


// async function justificarRespuestas(rutaArchivo, rutaSalida) {
//     // Leer el archivo Excel
//     const libro = xlsx.readFile(rutaArchivo);
//     const hoja = libro.Sheets[libro.SheetNames[0]];

//     // Convertir la hoja a JSON para manejar las filas
//     const datos = xlsx.utils.sheet_to_json(hoja, { header: 1 });

//     var tokensI = 0;
//     var tokensO = 0;

//     // Iterar sobre cada fila (saltando el encabezado)
//     for (let i = 1; i < datos.length; i++) {
//         const fila = datos[i];
//         const pregunta = fila[2]; // Columna C
//         // console.log(pregunta)
//         const respuestas = [fila[3], fila[4], fila[5], fila[6]]; // Columnas D, E, F y G
//         // console.log(respuestas)
//         const respuestaCorrecta = fila[7]; // Columna H
//         // console.log(respuestaCorrecta)

//         try {
//             // console.log('a')
//             // console.log(respuestaCorrecta)
//             const respuestaGPT = await llamarGPTSoloJustificaciones(openai, pregunta, respuestas, respuestaCorrecta);
//             const justificacion = respuestaGPT.choices[0].message.content;
//             fila[8] = justificacion; // Agregar la justificación a la columna I
//             // console.log(justificacion)

//             // Añado precios
//             tokensI += respuestaGPT.usage.prompt_tokens;
//             tokensO += respuestaGPT.usage.completion_tokens;
//         } catch(error) {
//             console.error(`Error al procesar la fila ${i}:`, error.message);
//             // console.log(error)
//             fila[8] = 'Error al obtener justificación';
//         }
//     }
//     // Calcular el costo
//     logger.info(`Precios para ${rutaArchivo}: Precio input: ${precioI * tokensI}, Precio output: ${precioO * tokensO}, Precio total: ${precioI * tokensI + precioO * tokensO}`);

//     // Convertir los datos de vuelta a hoja de cálculo
//     const nuevaHoja = xlsx.utils.aoa_to_sheet(datos);
//     const nuevoLibro = xlsx.utils.book_new();
//     xlsx.utils.book_append_sheet(nuevoLibro, nuevaHoja, 'Resultados');

//     // Guardar el archivo Excel modificado
//     xlsx.writeFile(nuevoLibro, rutaSalida);
//     console.log(`Archivo guardado con justificaciones en: ${rutaSalida}`);
// }




async function justificarRespuestas(rutaArchivo, rutaSalida) {
    // Leer el archivo Excel
    const libro = xlsx.readFile(rutaArchivo);
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
    logger.info(`Tokens para ${rutaArchivo}: Tokens input: ${tokensI}, Tokens output: ${tokensO}, Tokens totales: ${tokensI + tokensO}`);
    logger.info(`Precios para ${rutaArchivo}: Precio input: ${precioI * tokensI}, Precio output: ${precioO * tokensO}, Precio total: ${precioI * tokensI + precioO * tokensO}`);

    // Convertir los datos de vuelta a hoja de cálculo
    const nuevaHoja = xlsx.utils.aoa_to_sheet(datos);
    const nuevoLibro = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(nuevoLibro, nuevaHoja, 'Resultados');

    // Guardar el archivo Excel modificado
    xlsx.writeFile(nuevoLibro, rutaSalida);
    console.log(`Archivo guardado con justificaciones en: ${rutaSalida}`);
}



const targetPath = path.join(process.cwd(), 'src/target/examen.xlsx');
const endPath = path.join(process.cwd(), 'src/target/examen_justificado.xlsx');

// Llamar a la función
justificarRespuestas(targetPath, endPath);