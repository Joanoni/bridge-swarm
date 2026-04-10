const https = require('https');

function callApi(apiKey, body) {
    return new Promise((resolve, reject) => {
        const bodyStr = JSON.stringify(body);
        const options = {
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(bodyStr),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        const err = new Error(parsed.error.message || 'Anthropic API error');
                        err.statusCode = res.statusCode;
                        err.errorType = parsed.error.type;
                        reject(err);
                    } else {
                        resolve(parsed);
                    }
                } catch (e) {
                    reject(new Error(`HTTP ${res.statusCode} — non-JSON response. Body: ${data.slice(0, 200)}`));
                }
            });
        });

        req.on('error', (e) => reject(new Error(`Network error: ${e.message}`)));
        req.write(bodyStr);
        req.end();
    });
}

module.exports = { callApi };
