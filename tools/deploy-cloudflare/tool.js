const path = require('path');
const { spawn } = require('child_process');

const SCRIPT_PATH = path.join(__dirname, 'main.ps1');
const TIMEOUT_MS = 120000; // 2 minutes

const definition = {
    name: 'deploy_cloudflare',
    description: 'Deploys a static site directory to Cloudflare Pages using the wrangler CLI. Returns the stable deployment URL (e.g. https://my-project.pages.dev).',
    parameters: {
        type: 'object',
        properties: {
            message: { type: 'string', description: 'Brief note about what you are deploying (shown in chat).' },
            project_name: {
                type: 'string',
                description: 'The Cloudflare Pages project name (slug, e.g. "my-site"). Will be created if it does not exist.',
            },
            directory: {
                type: 'string',
                description: 'Absolute or relative path to the directory containing the static site files to deploy.',
            },
        },
        required: ['project_name', 'directory'],
    },
};

async function execute({ project_name, directory, message }) {
    return new Promise((resolve) => {
        const args = [
            '-NoProfile',
            '-NonInteractive',
            '-File', SCRIPT_PATH,
            '-ProjectName', project_name,
            '-Directory', directory,
        ];

        const child = spawn('powershell.exe', args, {
            env: process.env,
            windowsHide: true,
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', d => { stdout += d.toString(); });
        child.stderr.on('data', d => { stderr += d.toString(); });

        const timer = setTimeout(() => {
            child.kill();
            resolve({ ok: false, error: 'Deploy timed out after 120 seconds.', stdout, stderr });
        }, TIMEOUT_MS);

        child.on('close', (code) => {
            clearTimeout(timer);

            // Extract the clean URL from stdout
            const urlMatch = stdout.match(/Clean URL:\s*(https:\/\/\S+)/i);
            if (urlMatch) {
                resolve({ ok: true, url: urlMatch[1].trim(), stdout, stderr });
            } else {
                resolve({
                    ok: false,
                    error: 'Could not extract deployment URL from output.',
                    stdout,
                    stderr,
                    exitCode: code,
                });
            }
        });

        child.on('error', (err) => {
            clearTimeout(timer);
            resolve({ ok: false, error: err.message, stdout, stderr });
        });
    });
}

function toMessage({ project_name, directory, message }, result, agentId) {
    const note = message ? `${message}\n` : '';
    if (result && result.ok && result.url) {
        return `[${agentId}] 🚀 ${note}Deployed "${project_name}" → ${result.url}`;
    }
    const errDetail = result && result.error ? ` — ${result.error}` : '';
    return `[${agentId}] ❌ ${note}Deploy failed for "${project_name}"${errDetail}`;
}

module.exports = { definition, execute, toMessage };
