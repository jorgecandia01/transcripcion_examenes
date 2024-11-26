const { z } = require('zod');
const { zodResponseFormat } = require('openai/helpers/zod');


module.exports = {
    getSchema_5opciones,
    getSchema_SoloTrancripcion_5opciones,
    llamarGPTTranscripcionYJustificacion,
    llamarGPTSoloTrancripcion,
    llamarGPTSoloJustificaciones,
};

function getSchema_5opciones() {
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


function getSchema_SoloTrancripcion_5opciones() {
    const PreguntaSchema = z.object({
        indice: z.string(),
        enunciado: z.string(),
        respuesta_a: z.string(),
        respuesta_b: z.string(),
        respuesta_c: z.string(),
        respuesta_d: z.string(),
        respuesta_e: z.string(),
        // respuesta_correcta: z.enum(['A', 'B', 'C', 'D', 'E', 'ANULADA', '']),
        // respuesta_justificacion: z.string(),
        error: z.boolean(),
    });

    const ExamenSchemaArray = z.array(PreguntaSchema).nullable();
    const ExamenSchema = z.object({ array_preguntas: ExamenSchemaArray });

    return ExamenSchema;
}







/// Misma función para llamar a chatgpt pero aqui a veces hay una respuesta más (e) (tambien meto lo de respuesta vacía)
async function llamarGPTTranscripcionYJustificacion(openai, imagen_json, imagen_respuestas) {
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

    const ExamenSchema5 = getSchema_5opciones();

    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
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


async function llamarGPTSoloTrancripcion(openai, imagen_json) {
    const prompt_user_examen = `Aquí está la imagen de una página del examen junto al OCR de la imagen: ${imagen_json.ocr}`;
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
    
    La clave 'error' será false por defecto, y está reservada para los casos en los que la imagen proporcionada no contiene
    preguntas, o estas no cumplen con el JSON Schema proporcionado. Si pasa esto o cualquier otro problema, su valor debe ser 'true'.

    Como se itera sobre todas las páginas del PDF, es posible que la imagen proporcionada no contenga preguntas, dado que al principio y al final
    del examen suele haber una introducción y una despedida, y pueden existir páginas en blanco que no contienen preguntas. Para estos casos,
    hemos definido el array como z.array(PreguntaSchema).nullable(). Por lo tanto, si la imagen proporcionada no contiene preguntas, el array 
    debe ser null.`;

    const ExamenSchema_SoloTrancripcion_5opciones = getSchema_SoloTrancripcion_5opciones();

    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0,
        messages: [
            { role: "system", content: prompt_system },
            { role: "user", content: [
                {type: "text", text: prompt_user_examen},
                {type: "image_url", image_url: {url: `data:image/png;base64,${imagen_json.base64}`, detail: "high"}},
            ] },
        ],
        response_format: zodResponseFormat(ExamenSchema_SoloTrancripcion_5opciones, 'ExamenSchema_SoloTrancripcion_5opciones'),
    });

    return completion;
}





async function llamarGPTSoloJustificaciones(openai, pregunta, respuestas, respuestaCorrecta) {
    // Validar datos antes de enviar a la API
    if (!pregunta || respuestas.some((r) => !r) || !respuestaCorrecta) {
        throw new Error("Datos incompletos: pregunta, respuestas o respuesta correcta están vacíos.");
    }

    const prompt_system = `
        Eres un experto en oposiciones sanitarias y te dedicas a justificar las respuestas correctas de exámenes tipo test.
        A continuación, se te es entregada una pregunta de este examen, con sus opciones de respuesta y la RESPUESTA CORRECTA. 
        Debes justificar por qué la respuesta marcada como correcta es correcta, en base a tus conocimientos. 
        No justifiques ninguna otra respuesta, SÓLAMENTE la respuesta marcada como correcta. Extensión: 100-150 palabras.
    `;

    const prompt_user_examen = `
        Pregunta: ${pregunta}
        Opciones:
        A: ${respuestas[0]}
        B: ${respuestas[1]}
        C: ${respuestas[2]}
        D: ${respuestas[3]}
        Respuesta correcta: ${respuestaCorrecta}
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4", // Asegúrate de usar un modelo válido
            temperature: 0,
            messages: [
                { role: "system", content: prompt_system },
                { role: "user", content: prompt_user_examen },
            ],
        });

        return completion;
    } catch (error) {
        console.error("Error al llamar a la API de OpenAI:", error.message);
        throw error; // Re-lanzamos el error para manejarlo en el nivel superior
    }
}
