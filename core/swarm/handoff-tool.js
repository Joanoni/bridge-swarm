// _aiChat and _log are injected by swarm-loop.js via module-level vars
let _aiChat;
let _log;

function setDeps(aiChat, log) {
    _aiChat = aiChat;
    _log = log;
}

function buildHandoffTool(chatId) {
    return {
        definition: {
            name: 'handoff_to_agent',
            description:
                'Routes the conversation to the next agent in the swarm, or back to the user. ' +
                'The message field is your chat response to the user AND the briefing for the next agent. ' +
                'Call this tool when your task is complete or you need input from another agent or the user. ' +
                'You may route to yourself up to 2 times (3 consecutive turns max) before you must route elsewhere.',
            parameters: {
                type: 'object',
                properties: {
                    next_agent: {
                        type: 'string',
                        description: 'The ID of the next agent (e.g. "developer"), or "user" to return control to the human.',
                    },
                    message: {
                        type: 'string',
                        description: 'Your message to the user and briefing for the next agent. Keep it SHORT (2-3 sentences max).',
                    },
                },
                required: ['next_agent', 'message'],
            },
        },
        execute: async ({ next_agent, message }) => {
            _log(`[AI Swarm] handoff_to_agent → next_agent="${next_agent}"`);

            // Return to user — swarm goes idle
            if (!next_agent || next_agent === 'user') {
                return { ok: true, message, displayText: message, _handoff: { next_agent: 'user' } };
            }

            const session = _aiChat.getChat(chatId);
            if (!session) {
                return { ok: false, error: `Chat not found: ${chatId}` };
            }

            const availableAgents = _aiChat.listAllAgents(session.projectId).map(a => a.id);
            if (!availableAgents.includes(next_agent)) {
                return { ok: false, error: `Agent "${next_agent}" not found. Available: ${availableAgents.join(', ')}` };
            }

            return { ok: true, message, displayText: message, _handoff: { next_agent } };
        },
        toMessage: ({ message, next_agent }, result, agentId) => {
            return `[${agentId}] ${message}`;
        },
    };
}

module.exports = { buildHandoffTool, setDeps };
