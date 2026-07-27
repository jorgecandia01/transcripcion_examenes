const MODEL_CATALOG = Object.freeze({
    'gpt-5.6-terra': Object.freeze({
        inputPricePerMillion: 2.5,
        outputPricePerMillion: 15,
    }),
});

const ALLOWED_REASONING_EFFORTS = new Set(['none', 'low', 'medium', 'high', 'xhigh', 'max']);

function createOpenAIConfig(model, reasoningEffort) {
    const modelMetadata = MODEL_CATALOG[model];
    if (!modelMetadata) throw new Error(`El modelo OpenAI "${model}" no está definido en src/config/openaiConfig.js.`);
    if (!ALLOWED_REASONING_EFFORTS.has(reasoningEffort)) throw new Error(`Reasoning effort no válido: "${reasoningEffort}".`);

    return Object.freeze({
        model,
        reasoningEffort,
        inputPricePerToken: modelMetadata.inputPricePerMillion / 1000000,
        outputPricePerToken: modelMetadata.outputPricePerMillion / 1000000,
    });
}

module.exports = { createOpenAIConfig, MODEL_CATALOG };
