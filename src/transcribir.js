const xlsx = require('xlsx');
const {
    transcripcionOCRImagen,
    loadAndConvertPdf,
    asegurarParPDFPNG,
    convertirPNGABase64,
    obtenerArchivosPDFCrawler,
    obtenerArchivosPDF,
    convertPdfToImages,
    verificarCorrespondenciaPDFPNG,
    convertirArchivosABase64
} = require('./pdfUtils.js');
const {
    llamarGPTSoloTrancripcion,
    llamarGPTTranscripcionYJustificacion,
} = require('./gptUtils.js');
const { config } = require('./config/config.js');
const { iniciarMedicion, obtenerDuracionMs, formatearDuracionMs } = require('./timeUtils.js');

// Inicializa la API de OpenAI con la clave desde variables de entorno
// const api_key = process.env.OPENAI_API_KEY;
// const openai = new OpenAI({ apiKey: api_key });

const solo_transcripcion = 'solo_transcripcion';
const transcripcion_y_justificacion = 'transcripcion_y_justificacion';
const TIPOS_EJECUCION = new Set([solo_transcripcion, transcripcion_y_justificacion]);

module.exports = {
    iniciarTranscripcion
};


async function iniciarTranscripcion(tipo_ejecucion, files, openai) {
    const inicioPeticion = iniciarMedicion();
    if (!TIPOS_EJECUCION.has(tipo_ejecucion)) throw new Error(`Tipo de ejecución no válido: ${tipo_ejecucion}`);

    const resultados = [];
    const tiemposExamenes = [];

    const pares = verificarCorrespondenciaPDFPNG(files);
    const paresBase64 = convertirArchivosABase64(pares);

    console.log(`Ejecución seleccionada: ${tipo_ejecucion}`)
    // console.log(`Archivos PDF para transcribir: ${pares}`);

    for(const par of paresBase64) {
        // En solo_transcripcion no hace falta proporcionar una imagen de respuestas.
        
        if(par['png'] != null || tipo_ejecucion === solo_transcripcion){
            const inicioExamen = iniciarMedicion();
            console.log(`Se empieza a transcribir el PDF ${par.pdf.name}`);
            // Sin el await para que no se interrumpa y se hagan múltiples PDFs a la vez (chatgpt tarda una eternidad)
            // Meto el await porque sino el OCR funciona raro
            // await transcribirPdf(pdf, openai); // Mucho cuidado con los RATE LIMITS -> si son muchos PDFs/páginas puede saltar error
            const content = await transcribirPdf(par, openai, tipo_ejecucion);
            // const name = `resultado_transcripcion_${Date.now()}.xlsx`;
            const name = `${par['pdf']['name'].replace(/\.pdf$/i, '')}.xlsx`;
            resultados.push({ name, content });
            const duracionMs = Math.round(obtenerDuracionMs(inicioExamen));
            tiemposExamenes.push({ name: par.pdf.name, durationMs: duracionMs });
            console.log(`Examen ${par.pdf.name} completado en ${formatearDuracionMs(duracionMs)}.`);
            //PROBAR QUE ESPERE 20SEG ANTES DE LA SIGUIENTE ITERACIÓN
        } else {
            console.log('NO se procede a transcribir el PDF, ' + par + '. Se pasa al siguiente PDF');
        }
    }

    console.log('Transcripción de todos los PDFs terminada. Resultados: ', resultados);
    const duracionTotalMs = Math.round(obtenerDuracionMs(inicioPeticion));
    if (tiemposExamenes.length > 1) {
        console.log(`Petición completa de ${tiemposExamenes.length} exámenes terminada en ${formatearDuracionMs(duracionTotalMs)}.`);
    }
    return {
        resultFiles: resultados,
        timing: { totalMs: duracionTotalMs, exams: tiemposExamenes },
    };
}





async function transcribirPdf(par, openai, tipo_ejecucion) {
    const nombre = par['pdf']['name'];

    // Obtengo la imagen png en base64 para ingestarla a chatgpt
    const imagen_respuestas = tipo_ejecucion === transcripcion_y_justificacion
        ? par['png']['base64']
        : null;

    // Cargar y convertir el PDF a imágenes
    // let array_jsons_imagenes = await loadAndConvertPdf(nombre) || [];
    let array_jsons_imagenes = await convertPdfToImages(par['pdf']['base64']) || [];

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
                if (tipo_ejecucion === transcripcion_y_justificacion) {
                    respuesta = await llamarGPTTranscripcionYJustificacion(openai, imagen_json, imagen_respuestas);
                    // respuesta = await llamarGeminiTranscripcionYJustificacion(imagen_json, imagen_respuestas);
                } else if (tipo_ejecucion === solo_transcripcion) {
                    respuesta = await llamarGPTSoloTrancripcion(openai, imagen_json);
                } else {
                    throw new Error('La ejecución seleccionada no ha sido reconocida')
                }

                const contenido = JSON.parse(respuesta.choices[0].message.content); // PARA CHATGPT
                // const contenido = respuesta; // PARA GEMINI

                tokensI += respuesta.usage.prompt_tokens; // QUITAR TODO ESTO PARA GEMINI
                tokensO += respuesta.usage.completion_tokens;

                console.log(`Se ha transcrito la página ${imagen_json.page} de ${array_jsons_imagenesOCR.length} para el PDF ${nombre}. Se han utilizado ${respuesta.usage.prompt_tokens + respuesta.usage.completion_tokens} tokens`);

                return { index, contenido }; // Incluimos el índice para mantener el orden
            } catch (error) {
                console.log(`Error al procesar la imagen en el índice ${index + 1} del archivo ${nombre}: ${error.message}`);
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
            console.log('Array nulo -> no hay preguntas, no se añade nada de ' + nombre);
        }
    });

    // Calcular el costo
    console.log(`Tokens para ${nombre}: Tokens input: ${tokensI}, Tokens output: ${tokensO}, Tokens totales: ${tokensI + tokensO}`);
    console.log(`Coste estimado para ${nombre}: input $${(config.openai.inputPricePerToken * tokensI).toFixed(2)} USD, output $${(config.openai.outputPricePerToken * tokensO).toFixed(2)} USD, total $${(config.openai.inputPricePerToken * tokensI + config.openai.outputPricePerToken * tokensO).toFixed(2)} USD`);

    // Añadir la hoja de trabajo al libro de trabajo y guardar el archivo Excel
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Preguntas');
    const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });

    return buffer;
}
