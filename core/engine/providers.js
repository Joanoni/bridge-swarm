const id = 'anthropic';
const name = 'Anthropic';

const models = [
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
];

const PRICING = {
    'claude-sonnet-4-6':              { input: 3.00,  output: 15.00 },
    'claude-3-5-sonnet-20241022':     { input: 3.00,  output: 15.00 },
    'claude-3-opus-20240229':         { input: 15.00, output: 75.00 },
    'claude-3-haiku-20240307':        { input: 0.25,  output: 1.25  },
};

function calcCost(modelId, inputTokens, outputTokens) {
    const price = PRICING[modelId];
    if (!price) return 0;
    return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

function getProviders() {
    return [{ id, name, models }];
}

module.exports = { models, PRICING, calcCost, getProviders };
