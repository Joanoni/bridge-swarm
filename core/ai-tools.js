const readFile           = require('../tools/read-file/tool');
const writeFile          = require('../tools/write-file/tool');
const editFile           = require('../tools/edit-file/tool');
const listDirectory      = require('../tools/list-directory/tool');
const runTerminalCmd     = require('../tools/run-terminal-command/tool');
const webSearch          = require('../tools/web-search/tool');
const deployCloudflare   = require('../tools/deploy-cloudflare/tool');

// ── Tool registry ─────────────────────────────────────────────────────────────

const ALL_TOOLS = {
    read_file:            readFile,
    write_file:           writeFile,
    edit_file:            editFile,
    list_directory:       listDirectory,
    run_terminal_command: runTerminalCmd,
    web_search:           webSearch,
    deploy_cloudflare:    deployCloudflare,
};

/**
 * Returns tool objects for the given tool names, bound with agent context.
 * agentContext: { allowedPaths: string[], workspaceRoot: string }
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

module.exports = { getToolsForAgent, getAllToolNames };
