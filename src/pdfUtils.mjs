import { fromBuffer } from 'pdf2pic';
import Tesseract from 'tesseract.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { zodResponseFormat } from "openai/helpers/zod";

// const archivosPDF = obtenerArchivosPDF();
// console.log(archivosPDF);

export async function transcripcionOCRImagen(imagesBase64) {
    const transcriptions = await Promise.all(imagesBase64.map(async (base64Image) => {
        const imageBuffer = Buffer.from(base64Image, 'base64');
        const { data: { text } } = await Tesseract.recognize(
            imageBuffer,
            'spa',
        );
        return text;
    }));

    return transcriptions.join(' ');
}

/// Función que convierte un PDF en base64 a un array de JSON que contienen la clave 'base64' de la imagen png
export async function convertPdfToImages(pdfBase64) {
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const options = {
        density: 400,
        format: "png",
        width: 1200,
        height: 1692,
    };

    try {
        const converter = await fromBuffer(pdfBuffer, options).bulk(-1, { responseType: "base64" });
        return converter;
    } catch (error) {
        console.error("Error al convertir el PDF a imágenes: ", error);
    }
}

export function getSchema() {
    const PreguntaSchema = z.object({
        indice: z.string(),
        enunciado: z.string(),
        respuesta_a: z.string(),
        respuesta_b: z.string(),
        respuesta_c: z.string(),
        respuesta_d: z.string(),
        respuesta_correcta: z.enum(['a', 'b', 'c', 'd']),
        respuesta_justificacion: z.string(),
        error: z.boolean(),
    });

    const ExamenSchemaArray = z.array(PreguntaSchema).nullable();
    const ExamenSchema = z.object({ array_preguntas: ExamenSchemaArray });

    return ExamenSchema;
}

export function getSchema5() {
    const PreguntaSchema = z.object({
        indice: z.string(),
        enunciado: z.string(),
        respuesta_a: z.string(),
        respuesta_b: z.string(),
        respuesta_c: z.string(),
        respuesta_d: z.string(),
        respuesta_e: z.string(),
        respuesta_correcta: z.enum(['A', 'B', 'C', 'D', 'E', 'ANULADA', '']),
        respuesta_justificacion: z.string(),
        error: z.boolean(),
    });

    const ExamenSchemaArray = z.array(PreguntaSchema).nullable();
    const ExamenSchema = z.object({ array_preguntas: ExamenSchemaArray });

    return ExamenSchema;
}


/// Obtiene todos los .pdf de un directorio
export function obtenerArchivosPDF() {
    const targetPath = path.join(process.cwd(), 'src/target');
    const archivosPDF = [];

    // Leer los archivos en la carpeta /src/target
    const archivos = fs.readdirSync(targetPath);

    // Filtrar los archivos con extensión .pdf
    archivos.forEach((archivo) => {
        if (path.extname(archivo).toLowerCase() === '.pdf') {
            archivosPDF.push(archivo);
        }
    })

    return archivosPDF;
}


/// Obtiene todos los .pdf de un directorio y sus directorios en cascada
export function obtenerArchivosPDFCrawler() {
    const targetPath = path.join(process.cwd(), 'src', 'target');
    const archivosPDF = [];

    function buscarPDFs(directorio) {
        const archivos = fs.readdirSync(directorio);

        archivos.forEach((archivo) => {
            const rutaCompleta = path.join(directorio, archivo);

            if (fs.statSync(rutaCompleta).isDirectory()) {
                // Si es un directorio, llama a la función recursivamente
                buscarPDFs(rutaCompleta);
            } else if (path.extname(archivo).toLowerCase() === '.pdf') {
                // Si es un archivo .pdf, obtiene la ruta relativa a 'target'
                const rutaRelativa = path.relative(targetPath, rutaCompleta);
                archivosPDF.push(rutaRelativa);
            }
        });
    }

    // Iniciar la búsqueda desde el directorio targetPath
    buscarPDFs(targetPath);

    return archivosPDF;
}




export async function llamarGPT(openai, imagen_json, imagen_respuestas) {
    const prompt_user_examen = `Aquí está la imagen de una página del examen junto al OCR de la imagen: ${imagen_json.ocr}`;
    const prompt_user_respuestas = `Aquí está la imagen que contiene todas las respuestas del examen.`;
    const prompt_system = `Se pretende transformar un examen tipo test en formato PDF en un examen tipo test en formato JSON (JSON Schema).
    A continuación, se te pasa una de las páginas del PDF convertida a imagen png base64 y una transcripción OCR básica. Debes siempre
    fiarte más de tus capacidades de visión que de la transcripción OCR, ya que este es solamente una ayuda. El examen es un examen real
    que tiene que pasar una persona para aprobar una oposición sanitaria en España.

    Tu respuesta a este prompt debe ser un json que se ajusta al proporcionado por el JSON Schema. Este es un array de JSON en el que 
    cada elemento del array representa una de las preguntas del examen tipo test que aparece en la imagen. Para las claves 'indice' 
    (número de pregunta), 'enunciado', 'respuesta_a', 'respuesta_b', 'respuesta_c', 'respuesta_d', debes simplemente transcribir al pie de
    la letra cada pregunta, es muy importante que no te inventes nada. 
    Para la clave 'respuesta_correcta', debes seleccionar la respuesta correcta. Esta se encuentra dentro de la segunda imagen que te paso, 
    que contiene todas las respuestas correctas para todo el examen, por lo que debes escoger con cuidado la respuesta correcta fijándote en
    los índices de las preguntas de la primera imagen y su correspondencia en la hoja de soluciones, la segunda imagen.
    Para la clave 'respuesta_justificacion', debes razonar la pregunta y justificar la respuesta como un experto en la materia que eres. 
    Es decir, aquí sí que debes ser un experto, saber por qué es correcto y aportar con tu conocimiento, en un rango aproximado de 100-150 palabras. 
    La clave 'error' será false por defecto, y está reservada para los casos en los que la imagen proporcionada no contiene
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
                {type: "text", text: prompt_user_examen},
                {type: "image_url", image_url: {url: `data:image/png;base64,${imagen_json.base64}`, detail: "high"}},
            ] },
            { role: "user", content: [
                {type: "text", text: prompt_user_respuestas},
                {type: "image_url", image_url: {url: `data:image/png;base64,${imagen_respuestas}`, detail: "high"}},
            ] },
        ],
        response_format: zodResponseFormat(ExamenSchema, 'examen_schema'),
    });

    return completion;
}


/// Misma función para llamar a chatgpt pero aqui a veces hay una respuesta más (e) (tambien meto lo de respuesta vacía)
export async function llamarGPT5(openai, imagen_json, imagen_respuestas) {
    const prompt_user_examen = `Aquí está la imagen de una página del examen junto al OCR de la imagen: ${imagen_json.ocr}`;
    const prompt_user_respuestas = `Aquí está la imagen que contiene todas las respuestas del examen.`;
    const prompt_system = `Se pretende transformar un examen tipo test en formato PDF en un examen tipo test en formato JSON (JSON Schema).
    A continuación, se te pasa una de las páginas del PDF convertida a imagen png base64 y una transcripción OCR básica. Debes siempre
    fiarte más de tus capacidades de visión que de la transcripción OCR, ya que este es solamente una ayuda. El examen es un examen real
    que tiene que pasar una persona para aprobar una oposición sanitaria en España.

    Tu respuesta a este prompt debe ser un json que se ajusta al proporcionado por el JSON Schema. Este es un array de JSONs en el que 
    cada elemento del array representa una de las preguntas del examen tipo test que aparece en la imagen. Para las claves 'indice' 
    (número de pregunta), 'enunciado', 'respuesta_a', 'respuesta_b', 'respuesta_c', 'respuesta_d', debes simplemente transcribir al pie de
    la letra cada pregunta, es muy importante que no te inventes nada. Hay veces que además de las 4 respuestas, aparecerá una quinta respuesta,
    la respuesta e, que deberás transcribir en la clave 'respuesta_e'. Cuando no exista esta quinta respuesta (o cualquier otra), 
    simplemente devolverás un string vacío ('').
    Para la clave 'respuesta_correcta', debes seleccionar la respuesta correcta. Esta se encuentra dentro de la segunda imagen que te paso, 
    que contiene todas las respuestas correctas para todo el examen, por lo que debes escoger con cuidado la respuesta correcta fijándote en
    los índices de las preguntas de la primera imagen y su correspondencia en la hoja de soluciones, que es la segunda imagen. Algunas veces, la
    respuesta correcta aparece vacía, entonces pondrás 'ANULADA'. NUNCA te inventarás la respuesta correcta. También pondrás un string 
    vacío en 'respuesta_correcta' en caso de que no logres identificar con precisión la respuesta correcta en la imagen, pero NO TE LA INVENTARÁS.
    Para la clave 'respuesta_justificacion', debes razonar la pregunta y justificar la respuesta como un experto en la materia que eres,
    pero SIEMPRE SIEMPRE fijándote en la respuesta marcada como correcta en la imagen proporcionada en el prompt y justificando por qué la respuesta
    seleccionada es la correcta. Es decir, PRIMERO debes asociar la respuesta correcta desde la imagen y meterla en 'respuesta_correcta', y 
    es luego y SÓLAMENTE luego, cuando debes justificar por qué esa respuesta es la correcta. 
    Es decir, aquí sí que debes ser un experto, saber por qué es correcto y aportar con tu conocimiento, en un rango aproximado de 100-150 palabras. 
    La clave 'error' será false por defecto, y está reservada para los casos en los que la imagen proporcionada no contiene
    preguntas, o estas no cumplen con el JSON Schema proporcionado. Si pasa esto o cualquier otro problema, su valor debe ser 'true'.

    Voy a repetirlo una vez más porque es muy importante: A LA HORA DE ESCOGER RESPUESTA CORRECTA, DEBES ESCOGER LA OPCIÓN CORRESPONDIENTE
    DE LA IMAGEN QUE MUESTRA TODAS LAS RESPUESTAS. TIENES PROHIBIDO INVENTARTE CUÁL ES LA RESPUESTA CORRECTA PARA ELIMINAR EL RIEGO DE
    EQUIVOCACIÓN, YA TE HEMOS PREPARADO NOSOTROS LA RESPUESTA CORRECTA EN LA OTRA IMAGEN, SOLO TIENES QUE MARCARLA FIJÁNDOTE EN QUÉ ÍNDICE
    TIENE LA PREGUNTA QUE ESTÁS TRANSCRIBIENDO Y EL ÍNDICE DE LA PREGUNTA EN LA IMAGEN DE RESPUESTAS CORRECTAS. 
    POR FAVOR, NO TE CONFUNDAS DE RESPUESTA CORRECTA, FÍJATE BIEN EN LOS ÍNDICES EN LAS DOS IMÁGENES.

    Como se itera sobre todas las páginas del PDF, es posible que la imagen proporcionada no contenga preguntas, dado que al principio y al final
    del examen suele haber una introducción y una despedida, y pueden existir páginas en blanco que no contienen preguntas. Para estos casos,
    hemos definido el array como z.array(PreguntaSchema).nullable(). Por lo tanto, si la imagen proporcionada no contiene preguntas, el array 
    debe ser null.`;

    const ExamenSchema5 = getSchema5();

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-2024-08-06",
        temperature: 0,
        messages: [
            { role: "system", content: prompt_system },
            { role: "user", content: [
                {type: "text", text: prompt_user_examen},
                {type: "image_url", image_url: {url: `data:image/png;base64,${imagen_json.base64}`, detail: "high"}},
            ] },
            { role: "user", content: [
                {type: "text", text: prompt_user_respuestas},
                {type: "image_url", image_url: {url: `data:image/png;base64,${imagen_respuestas}`, detail: "high"}},
            ] },
        ],
        response_format: zodResponseFormat(ExamenSchema5, 'examen_schema5'),
    });

    return completion;
}


/// Función para cargar y convertir el PDF a imágenes (array de JSON que contienen la clave 'base64' de la imagen png)
export async function loadAndConvertPdf(nombre) {
    try {
        const __dirname = path.dirname(new URL(import.meta.url).pathname);
        const pdfPath = path.join(__dirname, 'target', nombre);
        const pdfBuffer = fs.readFileSync(pdfPath);
        const pdfBase64 = pdfBuffer.toString('base64');
        const imagenes = await convertPdfToImages(pdfBase64);

        return imagenes;
    } catch (error) {
        logger.error("-----> Error al cargar y convertir el PDF: ", error);
    }
}



export function asegurarParPDFPNG(nombrePDF) {
    const targetDir = path.join(process.cwd(), 'src', 'target');
    const archivoPDF = path.join(targetDir, nombrePDF);

    // console.log(archivoPDF);

    // Verificar si el archivo .pdf existe
    if (!fs.existsSync(archivoPDF)) {
        console.log(`-----> El archivo PDF ${nombrePDF} no existe en ${targetDir}.`);
        return false;
    }

    // Mantener la ruta original y solo cambiar la extensión
    const nombreBase = nombrePDF.replace(/\.pdf$/i, '');
    // const nombreBase = path.basename(nombrePDF, '.pdf');
    console.log(nombreBase)
    const archivoPNG = path.join(targetDir, `${nombreBase}.png`);
    console.log(archivoPNG);

    // Verificar si el archivo .png correspondiente existe
    if (!fs.existsSync(archivoPNG)) {
        console.error(`-----> El archivo PNG correspondiente para ${nombrePDF} NO existe`);
        return false;
    } else {
        console.error(`El archivo PNG correspondiente para ${nombrePDF} SI existe: ${archivoPNG}`);
        return true;
        // return archivoPNG;
    }
}



export function convertirPNGABase64(nombrePNG) {
    const targetDir = path.join(process.cwd(), 'src', 'target');
    const archivoPNG = path.join(targetDir, nombrePNG);

    // Leer el archivo .png y convertirlo a base64
    try {
        const imagenBuffer = fs.readFileSync(archivoPNG);
        const imagenBase64 = imagenBuffer.toString('base64');
        return imagenBase64;
    } catch (error) {
        console.error(`-----> Error al leer el archivo PNG ${nombrePNG}:`, error);
        return null;
    }
}

