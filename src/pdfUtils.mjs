import { fromBuffer } from 'pdf2pic';
import Tesseract from 'tesseract.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

const archivosPDF = obtenerArchivosPDF();
console.log(archivosPDF);

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



function obtenerArchivosPDF() {
    const targetPath = path.join(process.cwd(), 'src/target');
    const archivosPDF = [];

    // Leer los archivos en la carpeta /src/target
    const archivos = fs.readdirSync(targetPath);

    // Filtrar los archivos con extensión .pdf
    archivos.forEach((archivo) => {
        if (path.extname(archivo).toLowerCase() === '.pdf') {
            archivosPDF.push(archivo);
        }
    });

    return archivosPDF;
}