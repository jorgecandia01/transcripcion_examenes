const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
const { z } = require('zod');


function getSchema_5opciones() {
    const PreguntaSchema = z.object({
        indice: z.string(),
        enunciado: z.string(),
        respuesta_a: z.string(),
        respuesta_b: z.string(),
        respuesta_c: z.string(),
        respuesta_d: z.string(),
        respuesta_e: z.string(),
        respuesta_correcta: z.enum(['A', 'B', 'C', 'D', 'E', 'ANULADA']),
        respuesta_justificacion: z.string(),
        error: z.boolean(),
    });

    const ExamenSchemaArray = z.array(PreguntaSchema).nullable();
    const ExamenSchema = z.object({ array_preguntas: ExamenSchemaArray });

    return ExamenSchema;
}

function translateZodSchemaToGemini(zodSchema) {

    const geminiSchema = {
      description: "Array de preguntas de un examen tipo test",
      type: SchemaType.OBJECT,
        properties: {
          array_preguntas: {
          type: SchemaType.ARRAY,
          items: {
              type: SchemaType.OBJECT,
              properties: {
                indice: { type: SchemaType.STRING, description: "Número de la pregunta" },
                enunciado: { type: SchemaType.STRING, description: "Enunciado de la pregunta" },
                respuesta_a: { type: SchemaType.STRING, description: "Respuesta A" },
                respuesta_b: { type: SchemaType.STRING, description: "Respuesta B" },
                respuesta_c: { type: SchemaType.STRING, description: "Respuesta C" },
                respuesta_d: { type: SchemaType.STRING, description: "Respuesta D" },
                respuesta_e: { type: SchemaType.STRING, description: "Respuesta E" },
                respuesta_correcta: {
                  type: SchemaType.STRING,
                  enum: ["A", "B", "C", "D", "E", "ANULADA"],
                  description: "Respuesta correcta entre A, B, C, D, E, ANULADA o vacía"
                },
                respuesta_justificacion: { type: SchemaType.STRING, description: "Justificación de la respuesta" },
                error: { type: SchemaType.BOOLEAN, description: "Indica si ha habido algún error" },
              },
                required: ["indice", "enunciado", "respuesta_a", "respuesta_b", "respuesta_c", "respuesta_d", "respuesta_e", "respuesta_correcta", "respuesta_justificacion", "error"],
            },
              nullable: true
          }
      },
        required: ["array_preguntas"]
    };

    return geminiSchema;
  }


async function llamarGeminiTranscripcionYJustificacion(imagen_json, imagen_respuestas) {
    const gemini = new GoogleGenerativeAI('');
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
    const model = gemini.getGenerativeModel({ model: "gemini-1.5-flash" ,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: translateZodSchemaToGemini(ExamenSchema5),
      },
    });

    const parts = [
        { text: prompt_system },
        { text: prompt_user_examen },
        {
            inlineData: {
              mimeType: "image/png",
              data: imagen_json.base64
            }
        },
        { text: prompt_user_respuestas },
        {
            inlineData: {
              mimeType: "image/png",
              data: imagen_respuestas
            }
        }
      ];

    try{
      const result = await model.generateContent({contents: [{role: "user", parts}]});
      const response = await result.response;
      const text = response.text();
      console.log("Respuesta raw de Gemini:", text);


      try {
        const parsedResponse = JSON.parse(text);
        return parsedResponse;

         // Validar con Zod
         const validationResult = ExamenSchema5.safeParse(parsedResponse);

         if (!validationResult.success) {
           console.error("Error de validación Zod:", validationResult.error);
           return { error: validationResult.error, raw_response: text };
         }

         return { data: validationResult.data, raw_response: text};
        } catch (error) {
           console.error("Error parsing JSON:", error);
           return { error: error, raw_response: text};
         }
        } catch (error) {
           console.error("Error en la llamada a Gemini:", error);
           return { error: error, raw_response: null };
        }
}


module.exports = { llamarGeminiTranscripcionYJustificacion };