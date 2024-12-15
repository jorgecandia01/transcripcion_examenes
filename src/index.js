const OpenAI = require('openai');
const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const { iniciarTranscripcion } = require('./transcribir.js');
const { iniciarJustificacion } = require('./solo_justificacion.js');
const cors = require('cors');

const app = express();
app.use(cors());

const upload = multer({ dest: 'uploads/' });

const solo_transcripcion = 'solo_transcripcion';
const transcripcion_y_justificacion = 'transcripcion_y_justificacion';

// Endpoint para transcripción
app.post('/transcribir', upload.array('files'), async (req, res) => {
    try {
        const apiKey = req.body.apiKey;
        const files = req.files;

        if (!apiKey || !files) {
            return res.status(400).send('Faltan parámetros necesarios.');
        }

        console.log('Iniciando transcripción:', { apiKey, tipo: solo_transcripcion, files });

        const openai = new OpenAI({ apiKey: apiKey });

        const resultFiles = await iniciarTranscripcion(solo_transcripcion, files, openai);

        if (resultFiles.length === 0) {
            return res.status(400).send('No se pudieron transcribir los archivos.');
        }

        // Crear un ZIP en memoria
        const zip = new AdmZip();
        resultFiles.forEach(({ name, content }) => {
            zip.addFile(name, content);
        });

        const zipBuffer = zip.toBuffer();

        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': 'inline; filename="transcripcion_resultados.zip"',
            'Content-Length': zipBuffer.length,
        });

        res.send(zipBuffer);
    } catch (error) {
        console.log('Error al procesar la transcripción:', error);
        res.status(500).send('Error al procesar la solicitud.');
    }
});

// Endpoint para transcripción
app.post('/transcribir_y_justificar', upload.array('files'), async (req, res) => {
    try {
        const apiKey = req.body.apiKey;
        const files = req.files;

        if (!apiKey || !files) {
            return res.status(400).send('Faltan parámetros necesarios.');
        }

        console.log('Iniciando transcripción y justificación:', { apiKey, tipo: transcripcion_y_justificacion, files });

        const openai = new OpenAI({ apiKey: apiKey });

        const resultFiles = await iniciarTranscripcion(transcripcion_y_justificacion, files, openai);

        if (resultFiles.length === 0) {
            return res.status(400).send('No se pudieron transcribir los archivos.');
        }

        // Crear un ZIP en memoria
        const zip = new AdmZip();
        resultFiles.forEach(({ name, content }) => {
            zip.addFile(name, content);
        });

        const zipBuffer = zip.toBuffer();

        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': 'attachment; filename="transcripcion_resultados.zip"',
            'Content-Length': zipBuffer.length,
        });

        res.send(zipBuffer);
    } catch (error) {
        console.log('Error al procesar la transcripción:', error);
        res.status(500).send('Error al procesar la solicitud.');
    }
});

// Endpoint para justificación
app.post('/justificar', upload.array('files'), async (req, res) => {
    try {
        const apiKey = req.body.apiKey;
        const files = req.files;

        if (!apiKey || !files) {
            return res.status(400).send('Faltan parámetros necesarios.');
        }

        console.log('Iniciando justificación:', { apiKey, files });

        const openai = new OpenAI({ apiKey: apiKey });

        const resultFiles = await iniciarJustificacion(files, openai);

        if(resultFiles.length === 0) {
            return res.status(400).send('No se han encontrado archivos excel.');
        }

        // Crear un ZIP en memoria
        const zip = new AdmZip();
        resultFiles.forEach(({ name, content }) => {
            zip.addFile(name, content);
        });

        const zipBuffer = zip.toBuffer();

        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': 'attachment; filename="justificacion_resultados.zip"',
            'Content-Length': zipBuffer.length,
        });

        res.send(zipBuffer);
    } catch (error) {
        console.log('Error al procesar la justificación:', error);
        res.status(500).send('Error al procesar la solicitud.');
    }
});

// Array para guardar las conexiones activas
const activeConnections = [];

app.get('/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Añadir conexión activa
    activeConnections.push(res);

    // Enviar mensaje inicial
    res.write(`data: Conexión establecida\n\n`);

    req.on('close', () => {
        // Eliminar conexión cerrada
        const index = activeConnections.indexOf(res);
        if (index !== -1) {
            activeConnections.splice(index, 1);
        }
        console.log('Conexión SSE cerrada');
    });
});

// Función para enviar logs a todas las conexiones activas
function sendLogToClients(message) {
    activeConnections.forEach((res) => {
        res.write(`data: ${message}\n\n`);
    });
}

// Reemplazar console.log solo para los mensajes enviados al cliente
const originalLog = console.log;
console.log = function (...args) {
    const message = args.join(' ');
    sendLogToClients(message);
    originalLog(...args); // Mantener el comportamiento original de console.log
};


// Puerto
const PORT = 8080;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
