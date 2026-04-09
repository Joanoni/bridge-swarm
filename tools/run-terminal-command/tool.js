const path = require('path');
const { spawn } = require('child_process');

// Path to the compiled Go binary
const isWindows = process.platform === 'win32';
const RUNNER_BIN = path.join(__dirname, 'bin', isWindows ? 'runner.exe' : 'runner');

const definition = {
    name: 'run_terminal_command',
    description: 'Executes one or more shell commands sequentially in the workspace root directory. Each command has a 30-second timeout. Commands run in PowerShell on Windows, /bin/sh on Unix.',
    parameters: {
        type: 'object',
        properties: {
            message: { type: 'string', description: 'Brief note about what these commands do (shown in chat).' },
            commands: {
                type: 'array',
                items: { type: 'string' },
                description: 'An array of shell commands to execute sequentially.',
            },
        },
        required: ['commands'],
    },
};

async function execute({ commands, message }, { workspaceRoot }) {
    if (typeof commands === 'string') { try { const parsed = JSON.parse(commands); if (Array.isArray(parsed)) commands = parsed; } catch { /* keep as single string */ } }
    const cmdList = Array.isArray(commands) ? commands : (typeof commands === 'string' ? [commands] : []);
    const results = [];

    for (const command of cmdList) {
        const result = await new Promise((resolve) => {
            const child = spawn(RUNNER_BIN, [command], {
                cwd: workspaceRoot,
                env: process.env,
                windowsHide: true,
            });

            let stdout = '', stderr = '';
            child.stdout.on('data', d => { stdout += d.toString(); });
            child.stderr.on('data', d => { stderr += d.toString(); });

            const timer = setTimeout(() => {
                child.kill();
                resolve({ command, ok: false, error: 'Command timed out after 30 seconds.', stdout, stderr, exitCode: null });
            }, 30000);

            child.on('close', (code) => {
                clearTimeout(timer);
                resolve({ command, ok: code === 0, stdout, stderr, exitCode: code });
            });

            child.on('error', (err) => {
                clearTimeout(timer);
                // If runner binary not found, fall back to direct PowerShell/sh
                if (err.code === 'ENOENT') {
                    runFallback(command, workspaceRoot).then(resolve);
                } else {
                    resolve({ command, ok: false, error: err.message, stdout, stderr, exitCode: null });
                }
            });
        });

        results.push(result);
    }

    return { ok: true, results };
}

// Fallback: use spawn with shell directly if runner binary not compiled yet
function runFallback(command, workspaceRoot) {
    return new Promise((resolve) => {
        const shell = isWindows ? 'powershell.exe' : '/bin/sh';
        const shellArgs = isWindows ? ['-NoProfile', '-NonInteractive', '-Command', command] : ['-c', command];
        const child = spawn(shell, shellArgs, {
            cwd: workspaceRoot,
            env: process.env,
            windowsHide: true,
        });
        let stdout = '', stderr = '';
        child.stdout.on('data', d => { stdout += d.toString(); });
        child.stderr.on('data', d => { stderr += d.toString(); });
        const timer = setTimeout(() => { child.kill(); resolve({ command, ok: false, error: 'Timed out.', stdout, stderr, exitCode: null }); }, 30000);
        child.on('close', (code) => { clearTimeout(timer); resolve({ command, ok: code === 0, stdout, stderr, exitCode: code }); });
        child.on('error', (err) => { clearTimeout(timer); resolve({ command, ok: false, error: err.message, stdout, stderr, exitCode: null }); });
    });
}

function toMessage({ commands, message }, result, agentId) {
    const note = message ? `${message}\n` : '';
    const lines = (result?.results || []).map(r => {
        const output = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
        return `  $ ${r.command}${output ? `\n  > ${output}` : ''}`;
    });
    if (lines.length > 0) return `[${agentId}] 💻 ${note}${lines.join('\n')}`;
    const cmdList = Array.isArray(commands) ? commands : [commands];
    return `[${agentId}] 💻 ${note}$ ${cmdList.join(', ')}`;
}

module.exports = { definition, execute, toMessage };
