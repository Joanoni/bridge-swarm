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

// ── Cross-platform deploy via npx wrangler ────────────────────────────────────

function runCommand(cmd, args, env) {
    return new Promise((resolve) => {
        const child = spawn(cmd, args, { env, shell: true, windowsHide: true });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', d => { stdout += d.toString(); });
        child.stderr.on('data', d => { stderr += d.toString(); });
        child.on('close', code => resolve({ code, stdout, stderr }));
        child.on('error', err => resolve({ code: -1, stdout, stderr: stderr + '\n' + err.message }));
    });
}

async function deployLinux({ project_name, directory }) {
    const env = { ...process.env };

    // Step 1: ensure project exists (ignore errors — project may already exist)
    await runCommand('npx', [
        '--yes', 'wrangler', 'pages', 'project', 'create', project_name,
        '--production-branch', 'main',
    ], env);

    // Step 2: deploy
    const result = await runCommand('npx', [
        '--yes', 'wrangler', 'pages', 'deploy', directory,
        '--project-name', project_name,
        '--branch', 'main',
    ], env);

    return result;
}

async function deployWindows({ project_name, directory }) {
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
        child.on('close', code => resolve({ code, stdout, stderr }));
        child.on('error', err => resolve({ code: -1, stdout, stderr: stderr + '\n' + err.message }));
    });
}

async function execute({ project_name, directory, message }) {
    let result;

    const timer_promise = new Promise((resolve) =>
        setTimeout(() => resolve({ code: -1, stdout: '', stderr: 'Deploy timed out after 120 seconds.' }), TIMEOUT_MS)
    );

    const deploy_promise = process.platform === 'win32'
        ? deployWindows({ project_name, directory })
        : deployLinux({ project_name, directory });

    result = await Promise.race([deploy_promise, timer_promise]);

    const combined = result.stdout + '\n' + result.stderr;

    // Extract stable URL — matches both "https://xxx.pages.dev" patterns
    const urlMatch = combined.match(/Clean URL:\s*(https:\/\/\S+)/i)
        || combined.match(/(https:\/\/[a-zA-Z0-9-]+\.pages\.dev)/);

    if (urlMatch) {
        // Prefer the stable root URL (no hash prefix)
        const urls = [...combined.matchAll(/https:\/\/[a-zA-Z0-9-]+\.pages\.dev/g)].map(m => m[0]);
        // The stable URL is the shortest one (no deployment hash prefix)
        const stableUrl = urls.sort((a, b) => a.length - b.length)[0] || urlMatch[1];
        return { ok: true, url: stableUrl, stdout: result.stdout, stderr: result.stderr };
    }

    return {
        ok: false,
        error: result.stderr.includes('timed out') ? result.stderr : 'Could not extract deployment URL from output.',
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.code,
    };
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
