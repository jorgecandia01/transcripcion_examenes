const dotenv = require('dotenv');
const OpenAI = require('openai');
const xlsx = require('xlsx');
const {
    transcripcionOCRImagen,
    loadAndConvertPdf,
    asegurarParPDFPNG,
    convertirPNGABase64,
    obtenerArchivosPDFCrawler,
    obtenerArchivosPDF,
} = require('./pdfUtils.js');
const {
    llamarGPTSoloTrancripcion,
    llamarGPTTranscripcionYJustificacion,
} = require('./gptUtils.js');
const pino = require('pino');



dotenv.config();
const logger = pino();

// Inicializa la API de OpenAI con la clave desde variables de entorno
const api_key = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: api_key });

const precioI = 2.5 / 1000000;
const precioO = 10 / 1000000;

const solo_transcripcion = 'solo_transcripcion';
const transcripcion_y_justificacion = 'transcripcion_y_justificacion';

var ejecucion_seleccionada = ''

module.exports = {
    iniciarTranscripcion
};


async function iniciarTranscripcion(tipo_ejecucion){
    ejecucion_seleccionada = tipo_ejecucion;

    const pdfs = obtenerArchivosPDF();
    // const pdfs = obtenerArchivosPDFCrawler();
    console.log(`Ejecución seleccionada: ${ejecucion_seleccionada}`)
    console.log(`Archivos PDF para transcribir: ${pdfs}`);

    for(const pdf of pdfs) {
        if((ejecucion_seleccionada == solo_transcripcion) || asegurarParPDFPNG(pdf)){
            console.log('Se empieza a transcribir el PDF ' + pdf);
            // Sin el await para que no se interrumpa y se hagan múltiples PDFs a la vez (chatgpt tarda una eternidad)
            // Meto el await porque sino el OCR funciona raro
            await transcribirPdf(pdf); // Mucho cuidado con los RATE LIMITS -> si son muchos PDFs puede saltar error
            //PROBAR QUE ESPERE 20SEG ANTES DE LA SIGUIENTE ITERACIÓN
        } else {
            console.log('NO se procede a transcribir el PDF, ' + pdf + '. Se pasa al siguiente PDF');
        }
    }

    console.log('Transcripción de todos los PDFs terminada');
}







async function transcribirPdf(nombre) {
    // Extraigo el nombre base para utilizarlo en un futuro
    const nombreBase = nombre.replace(/\.pdf$/i, '');

    // Obtengo la imagen png en base64 para ingestarla a chatgpt
    if((ejecucion_seleccionada == transcripcion_y_justificacion)){
        var imagen_respuestas = convertirPNGABase64(`${nombreBase}.png`);
    }

    // Cargar y convertir el PDF a imágenes
    let array_jsons_imagenes = await loadAndConvertPdf(nombre) || [];

    // Variables para llevar la cuenta de los tokens
    let tokensI = 0;
    let tokensO = 0;

    // Realiza OCR a las imágenes
    console.log('Se empieza con el OCR para ' + nombre);
    const array_jsons_imagenesOCR = await Promise.all(
        array_jsons_imagenes.map(async (imagen_json) => {
            const ocr = await transcripcionOCRImagen([imagen_json.base64]);
            return { ...imagen_json, ocr };
        })
    );

    // Crea un libro de trabajo (workbook) y una hoja de trabajo (worksheet)
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.aoa_to_sheet([['Índice', 'Enunciado', 'Respuesta A', 'Respuesta B', 'Respuesta C', 'Respuesta D', 'Respuesta E', 'Respuesta Correcta', 'Justificación']]);

    // Llamada a GPT y procesamiento de las respuestas
    console.log('Se empieza a llamar a chatgpt para ' + nombre);

    const resultados = await Promise.all(
        array_jsons_imagenesOCR.map(async (imagen_json, index) => {
            try {
                let respuesta = '';
                if (ejecucion_seleccionada === transcripcion_y_justificacion) {
                    respuesta = await llamarGPTTranscripcionYJustificacion(openai, imagen_json, imagen_respuestas);
                } else if (ejecucion_seleccionada === solo_transcripcion) {
                    respuesta = await llamarGPTSoloTrancripcion(openai, imagen_json);
                } else {
                    throw new Error('La ejecución seleccionada no ha sido reconocida')
                }

                const contenido = JSON.parse(respuesta.choices[0].message.content);

                tokensI += respuesta.usage.prompt_tokens;
                tokensO += respuesta.usage.completion_tokens;

                console.log(`Se ha transcrito la página ${imagen_json.page} de ${array_jsons_imagenesOCR.length} para el PDF ${nombre}. Se han utilizado ${respuesta.usage.prompt_tokens + respuesta.usage.completion_tokens} tokens`);

                return { index, contenido }; // Incluimos el índice para mantener el orden
            } catch (error) {
                logger.error(`Error al procesar la imagen en el índice ${index + 1} del archivo ${nombre}: ${error.message}`);
                return { index, contenido: null }; // Retorna null si ocurre un error
            }
        })
    );

    // Reordena los resultados por índice para garantizar el orden original
    resultados.sort((a, b) => a.index - b.index);

    // Agrega las preguntas al Excel en orden
    resultados.forEach(({ contenido }) => {
        if (contenido && Array.isArray(contenido.array_preguntas)) {
            contenido.array_preguntas.forEach((pregunta) => {
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
                console.log('Pregunta añadida correctamente de ' + nombre);
            });
        } else {
            logger.warn('Array nulo -> no hay preguntas, no se añade nada de ' + nombre);
        }
    });

    // Calcular el costo
    console.log(`Tokens para ${nombre}: Tokens input: ${tokensI}, Tokens output: ${tokensO}, Tokens totales: ${tokensI + tokensO}`);
    console.log(`Precios para ${nombre}: Precio input: ${precioI * tokensI}, Precio output: ${precioO * tokensO}, Precio total: ${precioI * tokensI + precioO * tokensO}`);

    // Añadir la hoja de trabajo al libro de trabajo y guardar el archivo Excel
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Preguntas');
    xlsx.writeFile(workbook, `src/target/resultados_${ejecucion_seleccionada}/${nombreBase}.xlsx`);
    console.log('-- Preguntas guardadas en ' + `src/target/resultados_${ejecucion_seleccionada}/${nombreBase}.xlsx`);
}


