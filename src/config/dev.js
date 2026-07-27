const { createOpenAIConfig } = require('./openaiConfig.js');

module.exports = {
    server: {
        port: 8080,
        corsOrigins: '*',
    },
    public: {
        apiBaseUrl: 'http://127.0.0.1:8080',
    },
    openai: createOpenAIConfig('gpt-5.6-luna', 'medium'),
};
