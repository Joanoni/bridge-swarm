const https = require('https');

const definition = {
    name: 'web_search',
    description: 'Searches the web using Tavily and returns relevant results. Use this to find current information, news, documentation, or any content available on the internet.',
    parameters: {
        type: 'object',
        properties: {
            message: { type: 'string', description: 'Brief note about why you are searching (shown in chat).' },
            query: { type: 'string', description: 'The search query to look up on the web.' },
            max_results: { type: 'number', description: 'Maximum number of results to return (default: 5, max: 10).' },
        },
        required: ['query'],
    },
};

async function execute({ query, max_results, message }, agentContext) {
    const apiKey = (agentContext && agentContext.tavilyApiKey) || process.env.TAVILY_API_KEY || '';
    if (!apiKey) {
        return { ok: false, error: 'Tavily API key not configured. Please set it in Settings.' };
    }

    const body = JSON.stringify({
        api_key: apiKey,
        query,
        max_results: Math.min(max_results || 5, 10),
        include_answer: false,
        include_raw_content: false,
    });

    return new Promise((resolve) => {
        const options = {
            hostname: 'api.tavily.com',
            path: '/search',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        resolve({ ok: false, error: parsed.error });
                    } else {
                        const results = (parsed.results || []).map(r => ({
                            title: r.title,
                            url: r.url,
                            content: r.content,
                            score: r.score,
                        }));
                        resolve({ ok: true, query, results });
                    }
                } catch (e) {
                    resolve({ ok: false, error: `Failed to parse Tavily response: ${e.message}` });
                }
            });
        });

        req.on('error', (e) => resolve({ ok: false, error: `Network error: ${e.message}` }));
        req.write(body);
        req.end();
    });
}

function toMessage({ query, message }, _result, agentId) {
    const note = message ? `${message}\n` : '';
    return `[${agentId}] 🔍 ${note}Searching: ${query}`;
}

module.exports = { definition, execute, toMessage };
