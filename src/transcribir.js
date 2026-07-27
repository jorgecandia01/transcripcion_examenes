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
    const errores = [];
    const tiemposExamenes = [];
    const costesExamenes = [];
    let totalCostUsd = 0;

    const pares = verificarCorrespondenciaPDFPNG(files);

    console.log(`Ejecución seleccionada: ${tipo_ejecucion}`)
    // console.log(`Archivos PDF para transcribir: ${pares}`);

    for (const parArchivos of pares) {
        const inicioExamen = iniciarMedicion();
        const nombreExamen = parArchivos.pdf.originalname;

        try {
            // Leer cada par dentro de su propio bloque evita que un archivo ilegible
            // impida procesar los demás exámenes.
            const [par] = convertirArchivosABase64([parArchivos]);

            // En solo_transcripcion no hace falta proporcionar una imagen de respuestas.
            if (par.png == null && tipo_ejecucion !== solo_transcripcion) {
                throw new Error('No se encontró el PNG de respuestas correspondiente.');
            }

            console.log(`Se empieza a transcribir el PDF ${par.pdf.name}`);
            const { content, costUsd } = await transcribirPdf(par, openai, tipo_ejecucion);
            const name = `${par.pdf.name.replace(/\.pdf$/i, '')}.xlsx`;
            resultados.push({ name, content });
            totalCostUsd += costUsd;
            costesExamenes.push({ name: par.pdf.name, costUsd });
            const duracionMs = Math.round(obtenerDuracionMs(inicioExamen));
            tiemposExamenes.push({ name: par.pdf.name, durationMs: duracionMs });
            console.log(`Examen ${par.pdf.name} completado en ${formatearDuracionMs(duracionMs)}.`);
        } catch (error) {
            const duracionMs = Math.round(obtenerDuracionMs(inicioExamen));
            const message = error instanceof Error ? error.message : String(error);
            errores.push({ name: nombreExamen, message, durationMs: duracionMs });
            console.error(`Error al procesar el examen ${nombreExamen}. Se continúa con el siguiente:`, error);
        }
    }

    console.log(`Transcripción terminada: ${resultados.length} exámenes completados y ${errores.length} fallidos.`);
    const duracionTotalMs = Math.round(obtenerDuracionMs(inicioPeticion));
    if (pares.length > 1) {
        console.log(`Petición completa de ${pares.length} exámenes terminada en ${formatearDuracionMs(duracionTotalMs)}.`);
    }
    return {
        resultFiles: resultados,
        errors: errores,
        timing: { totalMs: duracionTotalMs, attemptedCount: pares.length, exams: tiemposExamenes },
        cost: { totalUsd: totalCostUsd, exams: costesExamenes },
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
    const array_jsons_imagenes = await convertPdfToImages(par.pdf.base64);
    if (!Array.isArray(array_jsons_imagenes) || array_jsons_imagenes.length === 0) {
        throw new Error('El PDF no contiene páginas que se puedan procesar.');
    }

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

    if (resultados.every(({ contenido }) => contenido === null)) {
        throw new Error('No se pudo procesar ninguna página del PDF.');
    }

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

    const inputCostUsd = config.openai.inputPricePerToken * tokensI;
    const outputCostUsd = config.openai.outputPricePerToken * tokensO;
    const costUsd = inputCostUsd + outputCostUsd;
    console.log(`Tokens para ${nombre}: Tokens input: ${tokensI}, Tokens output: ${tokensO}, Tokens totales: ${tokensI + tokensO}`);
    console.log(`Coste estimado para ${nombre}: input $${inputCostUsd.toFixed(2)} USD, output $${outputCostUsd.toFixed(2)} USD, total $${costUsd.toFixed(2)} USD`);

    // Añadir la hoja de trabajo al libro de trabajo y guardar el archivo Excel
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Preguntas');
    const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });

    return { content: buffer, costUsd };
}
