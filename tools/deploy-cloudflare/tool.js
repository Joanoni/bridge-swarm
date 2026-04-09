const { spawn } = require('child_process');

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function runCommand(args, env) {
    return new Promise((resolve) => {
        const child = spawn('npx', args, { env, shell: true, windowsHide: true });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', d => { stdout += d.toString(); });
        child.stderr.on('data', d => { stderr += d.toString(); });
        child.on('close', code => resolve({ code, stdout, stderr }));
        child.on('error', err => resolve({ code: -1, stdout, stderr: stderr + '\n' + err.message }));
    });
}

function buildEnv(agentContext) {
    const env = { ...process.env };
    if (agentContext && agentContext.cloudflareAccountId) env.CLOUDFLARE_ACCOUNT_ID = agentContext.cloudflareAccountId;
    if (agentContext && agentContext.cloudflareApiToken)  env.CLOUDFLARE_API_TOKEN  = agentContext.cloudflareApiToken;
    return env;
}

// ── Core deploy logic ─────────────────────────────────────────────────────────

async function deploy({ project_name, directory }, agentContext) {
    const env = buildEnv(agentContext);

    // Step 1: ensure project exists (ignore errors — project may already exist)
    await runCommand([
        '--yes', 'wrangler', 'pages', 'project', 'create', project_name,
        '--production-branch', 'main',
    ], env);

    // Step 2: deploy
    return runCommand([
        '--yes', 'wrangler', 'pages', 'deploy', directory,
        '--project-name', project_name,
        '--branch', 'main',
    ], env);
}

// ── execute ───────────────────────────────────────────────────────────────────

async function execute({ project_name, directory, message }, agentContext) {
    const timer_promise = new Promise((resolve) =>
        setTimeout(() => resolve({ code: -1, stdout: '', stderr: 'Deploy timed out after 120 seconds.' }), TIMEOUT_MS)
    );

    const result = await Promise.race([
        deploy({ project_name, directory }, agentContext),
        timer_promise,
    ]);

    const combined = result.stdout + '\n' + result.stderr;

    // Extract stable URL — prefer shortest pages.dev URL (no deployment-hash prefix)
    const allUrls = [...combined.matchAll(/https:\/\/[a-zA-Z0-9-]+\.pages\.dev/g)].map(m => m[0]);
    if (allUrls.length > 0) {
        const stableUrl = allUrls.sort((a, b) => a.length - b.length)[0];
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

function toMessage({ project_name, message }, result, agentId) {
    const note = message ? `${message}\n` : '';
    if (result && result.ok && result.url) {
        return `[${agentId}] 🚀 ${note}Deployed "${project_name}" → ${result.url}`;
    }
    const errDetail = result && result.error ? ` — ${result.error}` : '';
    return `[${agentId}] ❌ ${note}Deploy failed for "${project_name}"${errDetail}`;
}

module.exports = { definition, execute, toMessage };
