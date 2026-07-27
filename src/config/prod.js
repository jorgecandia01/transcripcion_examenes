const { createOpenAIConfig } = require('./openaiConfig.js');

module.exports = {
    server: {
        port: 8080,
        corsOrigins: '*',
    },
    public: {
        apiBaseUrl: 'https://backend-76375499655.europe-southwest1.run.app',
    },
    openai: createOpenAIConfig('gpt-5.6-luna', 'medium'),
};
