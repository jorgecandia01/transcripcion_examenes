const OPENAI_MODEL = 'gpt-5.6-terra';
const OPENAI_REASONING_EFFORT = 'medium';

// Tarifas estándar por millón de tokens (USD), consultadas el 2026-07-26.
const OPENAI_INPUT_PRICE_PER_TOKEN = 5 / 1000000;
const OPENAI_OUTPUT_PRICE_PER_TOKEN = 30 / 1000000;

module.exports = {
    OPENAI_MODEL,
    OPENAI_REASONING_EFFORT,
    OPENAI_INPUT_PRICE_PER_TOKEN,
    OPENAI_OUTPUT_PRICE_PER_TOKEN,
};
