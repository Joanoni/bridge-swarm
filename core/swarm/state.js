// Per-chat swarm state: chatId → { activeAgent, consecutiveSelfTurns, isProcessing }
const chatSwarmState = new Map();

const MAX_CONSECUTIVE_SELF_TURNS = 3;

function getSwarmState(chatId) {
    if (!chatSwarmState.has(chatId)) {
        chatSwarmState.set(chatId, {
            activeAgent: null,
            consecutiveSelfTurns: 0,
            isProcessing: false,
        });
    }
    return chatSwarmState.get(chatId);
}

module.exports = { chatSwarmState, getSwarmState, MAX_CONSECUTIVE_SELF_TURNS };
