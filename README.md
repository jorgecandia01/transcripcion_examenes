# Tool for Transcribing Multiple Choice Tests from PDF to Excel
This tool offers 1:1 tested transcription by combining OCR and ChatGPT's vision capabilities.

## How It Works
1. Place a PDF of the exam and a corresponding .png file containing all the answers in the /src/target folder. The .png file must have the same name as the PDF.
2. If a PDF does not have a corresponding .png, the script will skip that file.
3. The script will create an .xlsx file with the same base name as the PDF and .png, containing the entire exam in a tabulated format.

## Customization
The core functionality is composed of several functions, making it easy to customize for your specific use case. For example, if the correct answers are included with each question in the exam, you can remove the PDF-PNG validation and adjust the ChatGPT prompt to suit your needs.

## Intended Use Case
This tool is designed primarily for transcribing Spanish state job application exams, particularly for positions in the health sector. However, it can be adapted to other contexts as needed. The comments of the code and ChatGPT's promt are in spanish.

## Examples
You can find examples of the script's performance in the /src/target folder.

## Environments

Runtime configuration is centralized in `src/config/`: `dev.js` and `prod.js` contain the environment-specific values, `openaiConfig.js` contains the model catalog and pricing, and `config.js` selects and validates the active configuration through `APP_ENV`. Secrets must never be added to these files; use local environment variables or Secret Manager instead.

## Arquitectura de despliegue

Firebase Hosting y Cloud Run se despliegan por separado:

- `src/` contiene el backend y su configuración, mientras que `web/` contiene el frontend estático. Se mantienen separados porque son unidades de despliegue distintas: Cloud Run ejecuta `src/` y Firebase Hosting publica `web/`.
- Firebase Hosting solo publica los archivos situados dentro de `web/`, porque `firebase.json` define `"public": "web"`. Por ejemplo, `web/index.html` se sirve en `/` y `web/app.js` se serviría en `/app.js`.
- El directorio `src/`, junto con `package.json`, se incorpora a la imagen Docker y se ejecuta como backend en Cloud Run. `web/` no se incluye en esa imagen y Firebase Hosting no publica los archivos del backend.
- Los `rewrites` de Firebase no copian archivos externos dentro de Hosting. Únicamente reenvían las peticiones que coinciden con una ruta a otro servicio. En este proyecto, `/app-config.js` se reenvía al backend de Cloud Run, donde Express genera la respuesta dinámicamente.

Solo en desarrollo local, Express sirve también el contenido de `web/` mediante `express.static`, por lo que frontend y backend están disponibles desde el mismo servidor. En producción, Cloud Run sirve únicamente el backend y Firebase Hosting sirve el frontend.

Run the complete application locally (frontend and backend):

```bash
make install
make local
```

Run `make install` the first time and whenever `package.json` or `package-lock.json` changes.

Then open `http://127.0.0.1:8080`. Live Server is not required.

Deploy the complete application (Cloud Run backend and Firebase frontend):

```bash
gcloud auth login
make deploy-PROD
```

Firebase Hosting obtains its public runtime configuration from the Cloud Run `/app-config.js` endpoint.
