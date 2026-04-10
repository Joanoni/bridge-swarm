const definition = {
    name: 'send_chat_message',
    description: 'Sends a message to the user in the chat interface. Always use this tool to communicate with the user.',
    parameters: {
        type: 'object',
        properties: {
            text: { type: 'string', description: 'The message text to display to the user.' },
        },
        required: ['text'],
    },
};

async function execute({ text }) {
    return { ok: true, displayText: text };
}

function toMessage() {
    return null;
}

module.exports = { definition, execute, toMessage };
