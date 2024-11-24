import dotenv from 'dotenv';
import OpenAI from "openai";
import * as xlsx from 'xlsx';
import { transcripcionOCRImagen, loadAndConvertPdf, asegurarParPDFPNG, convertirPNGABase64, obtenerArchivosPDFCrawler } from './pdfUtils.mjs';
import { llamarGPTSoloTrancripcion, llamarGPTTranscripcionYJustificacion } from './gptUtils.mjs';
import pino from 'pino';


dotenv.config();
const logger = pino();

// Inicializa la API de OpenAI con la clave desde variables de entorno
const api_key = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: api_key });

const precioI = 2.5 / 1000000;
const precioO = 10 / 1000000;

// const tipo_ejecucion = ['solo_transcripcion', 'transcripcion_y_justificacion'];
const solo_transcripcion = 'solo_transcripcion';
const transcripcion_y_justificacion = 'transcripcion_y_justificacion';
const ejecucion_seleccionada = transcripcion_y_justificacion;

// const pdfs = obtenerArchivosPDF();
const pdfs = obtenerArchivosPDFCrawler();
logger.info(`Ejecución seleccionada: ${ejecucion_seleccionada}`)
logger.info(`Archivos PDF para transcribir: ${pdfs}`);

// transcribirPdf('examen2.pdf');

for(const pdf of pdfs) {
    if(asegurarParPDFPNG(pdf)){
        logger.info('Se empieza a transcribir el PDF ' + pdf);
        // Sin el await para que no se interrumpa y se hagan múltiples PDFs a la vez (chatgpt tarda una eternidad)
        // Meto el await porque sino el OCR funciona raro
        await transcribirPdf(pdf); // Mucho cuidado con los RATE LIMITS -> si son muchos PDFs puede saltar error
        //PROBAR QUE ESPERE 20SEG ANTES DE LA SIGUIENTE ITERACIÓN
    } else {
        logger.info('NO se procede a transcribir el PDF, ' + pdf + 'se pasa al siguiente PDF');
    }
}

logger.info('Transcripción de todos los PDFs terminada');






/// Función core que toma como argumento el nombre del archivo PDF y crea un .xlsx con la transcripción del examen
async function transcribirPdf(nombre) {
    // Extraigo el nombre base para utilizarlo en un futuro
    // const nombreBase = path.basename(nombre, '.pdf');
    const nombreBase = nombre.replace(/\.pdf$/i, '');

    // Objengo la imagen png en base64 para ingestarla a chatgpt
    const imagen_respuestas = convertirPNGABase64(`${nombreBase}.png`); // Uso este REGEX para eliminar el .png, pero dejar la ruta intacta

    // Cargar y convertir el PDF a imágenes
    let array_jsons_imagenes = await loadAndConvertPdf(nombre) || []; // Array de JSONs con imagen base64 y más cosas menos importantes

    // Variables para llevar la cuenta de los tokens
    let tokensI = 0;
    let tokensO = 0;

    // Realiza OCR a las imágenes
    logger.info('Se empieza con el OCR para ' + nombre);
    const array_jsons_imagenesOCR = await Promise.all(
        array_jsons_imagenes.map(async (imagen_json) => {
            const ocr = await transcripcionOCRImagen([imagen_json.base64]);
            // console.log(imagen_json);
            return { ...imagen_json, ocr };
        })
    );

    // Crea un libro de trabajo (workbook) y una hoja de trabajo (worksheet)
    const workbook = xlsx.utils.book_new();
    // const worksheet = xlsx.utils.aoa_to_sheet([['Índice', 'Enunciado', 'Respuesta A', 'Respuesta B', 'Respuesta C', 'Respuesta D', 'Respuesta Correcta', 'Justificación']]);
    const worksheet = xlsx.utils.aoa_to_sheet([['Índice', 'Enunciado', 'Respuesta A', 'Respuesta B', 'Respuesta C', 'Respuesta D', 'Respuesta E', 'Respuesta Correcta', 'Justificación']]);

    // Llamada a GPT y procesamiento de las respuestas
    logger.info('Se empieza a llamar a chatgpt para ' + nombre);
    for (const imagen_json of array_jsons_imagenesOCR) {
        try {
            var respuesta = '';
            if(ejecucion_seleccionada == transcripcion_y_justificacion){
                respuesta = await llamarGPTTranscripcionYJustificacion(openai, imagen_json, imagen_respuestas);
            } else if(ejecucion_seleccionada == solo_transcripcion){
                respuesta = await llamarGPTSoloTrancripcion(openai, imagen_json);
            }

            const contenido = JSON.parse(respuesta.choices[0].message.content); 

            tokensI += respuesta.usage.prompt_tokens;
            tokensO += respuesta.usage.completion_tokens;

            logger.info(`Se ha transcrito la página ${imagen_json.page} de ${array_jsons_imagenesOCR.length} para el PDF ${nombre}. Se han utilizado ${respuesta.usage.prompt_tokens + respuesta.usage.completion_tokens} tokens`);

            if (Array.isArray(contenido.array_preguntas)) {
                contenido.array_preguntas.forEach(pregunta => {
                    xlsx.utils.sheet_add_aoa(worksheet, [[
                        pregunta.indice,
                        pregunta.enunciado,
                        pregunta.respuesta_a,
                        pregunta.respuesta_b,
                        pregunta.respuesta_c,
                        pregunta.respuesta_d,
                        pregunta.respuesta_e,
                        pregunta.respuesta_correcta,
                        pregunta.respuesta_justificacion
                    ]], { origin: -1 });
                    logger.info('Pregunta añadida correctamente de ' + nombre);
                });
            } else {
                logger.warn('Array nulo -> no hay preguntas, no se añade nada de ' + nombre);
            }
        } catch (error) {
            logger.error('Error al llamar a GPT o procesar la respuesta en ' + nombre);
            console.log(error);
            continue; // Saltar a la siguiente iteración en caso de error
        }
    }

    // Calcular el costo
    logger.info(`Precios para ${nombre}: Precio input: ${precioI * tokensI}, Precio output: ${precioO * tokensO}, Precio total: ${precioI * tokensI + precioO * tokensO}`);

    // Añadir la hoja de trabajo al libro de trabajo y guardar el archivo Excel
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Preguntas');
    xlsx.writeFile(workbook, `src/target/resultados_${ejecucion_seleccionada}/${nombreBase}.xlsx`);
    logger.info('-- Preguntas guardadas en ' + `src/target/resultados_${ejecucion_seleccionada}/${nombreBase}.xlsx`);
}




