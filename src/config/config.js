const CONFIGS = {
    development: require('./dev.js'),
    production: require('./prod.js'),
};

const isCloudRun = Boolean(process.env.K_SERVICE || process.env.CLOUD_RUN_JOB);
if (isCloudRun && !process.env.APP_ENV) {
    throw new Error('APP_ENV es obligatorio en Cloud Run.');
}

const environment = process.env.APP_ENV || 'development';
const environmentConfig = CONFIGS[environment];

if (!environmentConfig) {
    throw new Error(`APP_ENV no válido: "${environment}". Usa development o production.`);
}

const port = Number(process.env.PORT ?? environmentConfig.server.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe ser un puerto TCP válido.');
}

const config = {
    ...environmentConfig,
    environment,
    server: {
        ...environmentConfig.server,
        port,
    },
    public: {
        ...environmentConfig.public,
        environment,
    },
};

function logConfig() {
    console.log('Configuración cargada:', {
        environment: config.environment,
        port: config.server.port,
        apiBaseUrl: config.public.apiBaseUrl,
        openaiModel: config.openai.model,
        openaiReasoningEffort: config.openai.reasoningEffort,
    });
}

module.exports = { config, logConfig };
