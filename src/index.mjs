import dotenv from 'dotenv';
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import fs from 'fs';
import path from 'path';
import * as xlsx from 'xlsx';
import { getSchema } from './pdfUtils.mjs';
import { transcripcionOCRImagen, convertPdfToImages } from './pdfUtils.mjs';
import pino from 'pino';

dotenv.config();
const logger = pino();

// Inicializa la API de OpenAI con la clave desde variables de entorno
const api_key = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: api_key });

let tokensI = 0;
let tokensO = 0;
const precioI = 2.5 / 1000000;
const precioO = 10 / 1000000;


let array_jsons_imagenes = await loadAndConvertPdf() || []; // Array de JSONs con imagen base64 y más cosas menos importantes


// Realiza OCR a las imágenes
logger.info('Se empieza con el OCR');
const array_jsons_imagenesOCR = await Promise.all(
    array_jsons_imagenes.map(async (imagen_json) => {
        const ocr = await transcripcionOCRImagen([imagen_json.base64]);
        console.log(imagen_json);
        return { ...imagen_json, ocr };
    })
);


// Crea un libro de trabajo (workbook) y una hoja de trabajo (worksheet)
const workbook = xlsx.utils.book_new();
const worksheet = xlsx.utils.aoa_to_sheet([['Índice', 'Enunciado', 'Respuesta A', 'Respuesta B', 'Respuesta C', 'Respuesta D', 'Respuesta Correcta', 'Justificación']]);


logger.info('Se empieza a llamar a chatgpt');
for (const imagen_json of array_jsons_imagenesOCR) {
    logger.info(`Página ${imagen_json.page} de ${array_jsons_imagenesOCR.length}`);
    try {
        const respuesta = await llamarGPT(openai, imagen_json);
        const contenido = JSON.parse(respuesta.choices[0].message.content); 

        tokensI += respuesta.usage.prompt_tokens;
        tokensO += respuesta.usage.completion_tokens;

        if (Array.isArray(contenido.array_preguntas)) {
            contenido.array_preguntas.forEach(pregunta => {
                xlsx.utils.sheet_add_aoa(worksheet, [[
                    pregunta.indice,
                    pregunta.enunciado,
                    pregunta.respuesta_a,
                    pregunta.respuesta_b,
                    pregunta.respuesta_c,
                    pregunta.respuesta_d,
                    pregunta.respuesta_correcta,
                    pregunta.respuesta_justificacion
                ]], { origin: -1 });
                logger.info('Pregunta añadida correctamente');
            });
        } else {
            logger.warn('Array nulo -> no hay preguntas, no se añade nada');
        }
    } catch (error) {
        logger.error('Error al llamar a GPT o procesar la respuesta:', error);
        console.log(error);
        continue; // Saltar a la siguiente iteración en caso de error
    }
}

// Añadir la hoja de trabajo al libro de trabajo y guardar el archivo Excel
xlsx.utils.book_append_sheet(workbook, worksheet, 'Preguntas');
xlsx.writeFile(workbook, 'examen_preguntas.xlsx');

// Calcular el costo
logger.info(`Precio input: ${precioI * tokensI}, Precio output: ${precioO * tokensO}, Precio total: ${precioI * tokensI + precioO * tokensO}`);

async function llamarGPT(openai, imagen_json) {
    const prompt_user = `Aquí está el OCR de la imagen: ${imagen_json.ocr}`;
    const prompt_system = `Se pretende transformar un examen tipo test en formato PDF en un examen tipo test en formato JSON (JSON Schema).
    A continuación, se te pasa una de las páginas del PDF convertida a imagen png base64 y una transcripción OCR básica. Debes siempre
    fiarte más de tus capacidades de visión que de la transcripción OCR, ya que este es solamente una ayuda. El examen es un examen real
    que tiene que pasar una persona para aprobar una oposición sanitaria en España.

    Tu respuesta a este prompt debe ser un json que se ajusta al proporcionado por el JSON Schema. Este es un array de JSON en el que 
    cada elemento del array representa una de las preguntas del examen tipo test que aparece en la imagen. Para las claves 'indice' 
    (número de pregunta), 'enunciado', 
    'respuesta_a', 'respuesta_b', 'respuesta_c', 'respuesta_d', debes simplemente transcribir al pie de la letra cada pregunta, es muy 
    importante que no te inventes nada. Para las claves 'respuesta_correcta' y 'respuesta_justificacion', debes razonar cuál es la respuesta
    correcta y la justificación de por qué has elegido esa opción. Es decir, aquí sí que debes ser un experto, saber qué es correcto y aportar
    con tu conocimiento. La clave 'error' será false por defecto, y está reservada para los casos en los que la imagen proporcionada no contiene
    preguntas, o estas no cumplen con el JSON Schema proporcionado. Si pasa esto o cualquier otro problema, su valor debe ser 'true'.

    Como se itera sobre todas las páginas del PDF, es posible que la imagen proporcionada no contenga preguntas, dado que al principio y al final
    del examen suele haber una introducción y una despedida, y pueden existir páginas en blanco que no contienen preguntas. Para estos casos,
    hemos definido el array como z.array(PreguntaSchema).nullable(). Por lo tanto, si la imagen proporcionada no contiene preguntas, el array 
    debe ser null.`;

    const ExamenSchema = getSchema();

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-2024-08-06",
        temperature: 0,
        messages: [
            { role: "system", content: prompt_system },
            { role: "user", content: [
                {type: "text", text: prompt_user},
                {type: "image_url", image_url: {url: `data:image/png;base64,${imagen_json.base64}`, detail: "high"}},
            ] },
        ],
        response_format: zodResponseFormat(ExamenSchema, 'examen_schema'),
    });

    // console.log(completion.choices[0].message.content);
    return completion;
}

// Función para cargar y convertir el PDF
async function loadAndConvertPdf() {
    try {
        const __dirname = path.dirname(new URL(import.meta.url).pathname);
        const pdfPath = path.join(__dirname, 'pdfs', 'examen2.pdf');
        const pdfBuffer = fs.readFileSync(pdfPath);
        const pdfBase64 = pdfBuffer.toString('base64');
        const imagenes = await convertPdfToImages(pdfBase64);

        return imagenes;
    } catch (error) {
        logger.error("Error al cargar y convertir el PDF: ", error);
    }
}


