const fs = require('fs');
const path = require('path');

const toolsDir = path.join(__dirname, '..', 'tools');

// ── Tool registry ─────────────────────────────────────────────────────────────

/** @type {Record<string, { definition: object, execute: Function, toMessage: Function, _toolPath: string }>} */
const ALL_TOOLS = {};

function loadTools() {
    const entries = fs.readdirSync(toolsDir, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const toolPath = path.join(toolsDir, entry.name, 'tool.js');
        if (!fs.existsSync(toolPath)) continue;
        try {
            const tool = require(toolPath);
            if (!tool.definition || !tool.definition.name) continue;
            ALL_TOOLS[tool.definition.name] = { ...tool, _toolPath: toolPath };
        } catch (err) {
            console.error(`[ai-tools] Failed to load tool at ${toolPath}:`, err.message);
        }
    }
}

function reloadTools() {
    for (const name of Object.keys(ALL_TOOLS)) {
        const toolPath = ALL_TOOLS[name]._toolPath;
        try { delete require.cache[require.resolve(toolPath)]; } catch { /* ignore */ }
        delete ALL_TOOLS[name];
    }
    loadTools();
}

// Initial load
loadTools();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns tool objects for the given tool names, bound with agent context.
 * @param {string[]} toolNames
 * @param {{ allowedPaths: string[], workspaceRoot: string }} agentContext
 */
function getToolsForAgent(toolNames, agentContext) {
    return toolNames
        .filter(name => ALL_TOOLS[name])
        .map(name => {
            const tool = ALL_TOOLS[name];
            return {
                definition: tool.definition,
                execute: (input) => tool.execute(input, agentContext),
                toMessage: tool.toMessage,
            };
        });
}

function getAllToolNames() {
    return Object.keys(ALL_TOOLS);
}

module.exports = { getToolsForAgent, getAllToolNames, reloadTools };
