import { fromBuffer } from 'pdf2pic';
import Tesseract from 'tesseract.js';
import fs from 'fs';
import path from 'path';

// const archivosPDF = obtenerArchivosPDF();
// console.log(archivosPDF);


/// Obtiene un array de imagenes en base64 y devuelve un String con la transcripcion de todas las imágenes
/// En este caso sólamente se usa con 1 imagen, de una única pagina del PDF
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

/// Función que convierte todas las páginas de un PDF en base64 a un array de JSON que contienen la clave 'base64' de la imagen png
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




/// Obtiene todos los .pdf de un directorio. En este caso ../src/target/
/// Sólamente obtiene el nombre, no la ruta (ejemplo: 'examen.pdf')
export function obtenerArchivosPDF() {
    const targetPath = path.join(__dirname, 'target');
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


/// Obtiene todos los .pdf de un directorio. En este caso ../src/target/
/// Sólamente obtiene el nombre, no la ruta (ejemplo: 'examen.xlsx')
export function obtenerArchivosXLSX() {
    const targetPath = path.join(__dirname, 'target');
    const archivosPDF = [];

    // Leer los archivos en la carpeta /src/target
    const archivos = fs.readdirSync(targetPath);

    // Filtrar los archivos con extensión .pdf
    archivos.forEach((archivo) => {
        if (path.extname(archivo).toLowerCase() === '.xlsx') {
            archivosPDF.push(archivo);
        }
    })

    return archivosPDF;
}


/// Obtiene todos los .pdf de un directorio y sus directorios en cascada. En este caso ../src/target/
export function obtenerArchivosPDFCrawler() {
    const targetPath = path.join(__dirname, 'target');
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



/// Función para cargar y convertir un PDF (ruta) a imágenes (array de JSON que contienen la clave 'base64' de la imagen png)
/// Usado para ingestar las imagenes a la llamada de chatgpt
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



/// Función que asegura que el archivo .pdf que se pasa como argumento (la ruta), tiene su correspondiente .png en la misma ruta
export function asegurarParPDFPNG(nombrePDF) {
    const targetDir = path.join(__dirname, 'target');
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


/// Función que obtiene la ruta de una imagen PNG (desde src/target), y devuelve un String base64 del PNG
/// Usado para tratar las imagenes .png de las respuestas tipo test 
export function convertirPNGABase64(nombrePNG) {
    const targetDir = path.join(__dirname, 'target');
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

