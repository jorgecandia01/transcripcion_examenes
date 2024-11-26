const readline = require('readline');
const { iniciarTranscripcion } = require('./transcribir.js');
const { iniciarJustificacion } = require('./solo_justificacion.js');


const solo_transcripcion = 'solo_transcripcion';
const transcripcion_y_justificacion = 'transcripcion_y_justificacion';


const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function main() {
    console.log('Selecciona una opción:');
    console.log('1. Iniciar SÓLO transcripción');
    console.log('2. Iniciar transcripción Y justificación');
    console.log('3. Iniciar SÓLO justificación');
    console.log('4. Salir');

    rl.question('Ingresa el número de tu elección: ', async (opcion) => {
        switch (opcion) {
            case '1':
                console.log('Iniciando SÓLO transcripción...');
                await iniciarTranscripcion(solo_transcripcion); // Cambia el tipo según tu necesidad
                break;

            case '2':
                console.log('Iniciando transcripción Y justificación...');
                await iniciarTranscripcion(transcripcion_y_justificacion); // Cambia el tipo según tu necesidad
                break;

            case '3':
                console.log('Iniciando justificación...');
                await iniciarJustificacion();
                break;

            case '4':
                console.log('Saliendo...');
                rl.close();
                return;

            default:
                console.log('Opción no válida, intenta de nuevo.');
        }

        rl.close(); // Cierra la interfaz después de completar la tarea
    });
}

main().catch((error) => {
    console.error('Error crítico:', error);
    rl.close();
});



