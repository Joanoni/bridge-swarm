const fs = require('fs');
const path = require('path');
const os = require('os');
const { getDataRoot, getSettings } = require('./state');

function getChatFilesDir(chatId, projectId) {
    const _settings = getSettings();
    const _dataRoot = getDataRoot();
    const chatsBase = projectId
        ? (() => {
            const projects = _settings.getProjects();
            const project = projects.find(p => p.id === projectId);
            return project ? path.join(project.path, 'chats') : path.join(_dataRoot, 'chats');
        })()
        : path.join(_dataRoot, 'chats');
    return path.join(chatsBase, chatId, 'files');
}

function listChatFiles(chatId, projectId) {
    const dir = getChatFilesDir(chatId, projectId);
    if (!fs.existsSync(dir)) return [];
    try {
        return fs.readdirSync(dir).filter(f => {
            try { return fs.statSync(path.join(dir, f)).isFile(); } catch { return false; }
        });
    } catch { return []; }
}

function buildFilesSection(chatId, projectId) {
    const files = listChatFiles(chatId, projectId);
    if (files.length === 0) return '';
    const dir = getChatFilesDir(chatId, projectId);
    const lines = files.map(f => `- ${f}`).join('\n');
    return `## Attached Files\n\nThe following files have been attached to this chat and are available at: \`${dir}\`\n\n${lines}\n\nYou can read these files using the \`read_file\` tool with the full path above.`;
}

function buildContextPrefix(workspaceRoot) {
    const platform = os.platform();
    const release = os.release();
    const isWindows = platform === 'win32';
    const shell = isWindows ? 'PowerShell' : (process.env.SHELL || 'bash');
    const now = new Date().toLocaleString('en-US', { timeZoneName: 'short' });

    return `# Environment Context

- **Operating System:** ${platform} ${release}${isWindows ? ' (Windows)' : ''}
- **Default Shell:** ${shell}
- **Current Time:** ${now}
- **Workspace Root:** ${workspaceRoot || '(unknown)'}

${isWindows ? '> **Note:** Commands run in PowerShell. Use PowerShell syntax: `Get-ChildItem` or `ls`, `New-Item -ItemType Directory` or `mkdir`, `Get-Content` or `cat`, `Remove-Item` or `rm`, `Copy-Item` or `cp`. You can also use most Unix-style aliases.' : ''}

## Tool Usage Rule

Every tool call **must** include a "message" parameter — a single short sentence explaining what you are doing. This is shown as a summary badge in the chat UI. Keep it brief and informative.
`;
}

module.exports = { buildContextPrefix, buildFilesSection, getChatFilesDir, listChatFiles };
