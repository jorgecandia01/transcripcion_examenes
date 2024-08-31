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