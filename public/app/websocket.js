// app/websocket.js — WebSocket connection and server event handler
var App = window.App = window.App || {};

App._ws = null;
App._wsTimer = null;

App.connectWS = function() {
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    App._ws = new WebSocket(protocol + '//' + location.host);
    App._ws.addEventListener('open', function() { App.connStatus.classList.add('connected'); clearTimeout(App._wsTimer); });
    App._ws.addEventListener('close', function() { App.connStatus.classList.remove('connected'); App._wsTimer = setTimeout(App.connectWS, 3000); });
    App._ws.addEventListener('error', function() { App.connStatus.classList.remove('connected'); });
    App._ws.addEventListener('message', function(event) {
        var msg; try { msg = JSON.parse(event.data); } catch(e) { return; }
        App.handleServerEvent(msg.event, msg.payload);
    });
};

App.handleServerEvent = function(event, payload) {
    switch (event) {
        case 'INIT_STATE':
            App.allChats = payload.chats || [];
            App.allProjects = payload.projects || [];
            App.renderProjectSelector();
            App.renderChatList();
            if (App.allChats.length > 0) {
                App.activeChatId = App.allChats[0].id;
                App.openChat(App.allChats[0].id);
            }
            break;

        case 'APPEND_MESSAGE':
            if (payload.chatId === App.activeChatId && payload.role && payload.content) {
                if (payload.role === 'assistant') App.hideThinking();
                App.appendMessage(payload.role, payload.content, payload.agentId);
            }
            var chatIdx = App.allChats.findIndex(function(c){ return c.id === payload.chatId; });
            if (chatIdx !== -1) {
                App.allChats[chatIdx].lastMessage = (payload.content||'').slice(0, 80);
                App.renderChatList();
            }
            break;

        case 'REPLACE_HISTORY':
            if (payload.chatId === App.activeChatId) {
                App.messagesEl.innerHTML = '';
                App.userMessageCount = 0;
                (payload.messages||[]).forEach(function(m) {
                    if ((m.role==='user'||m.role==='assistant') && m.content) App.appendMessage(m.role, m.content, m.agentId);
                });
            }
            break;

        case 'COST_UPDATED':
            if (payload.chatId === App.activeChatId) {
                App.chatCost.textContent = '$' + (payload.totalCostUsd||0).toFixed(4);
            }
            var ci = App.allChats.findIndex(function(c){ return c.id === payload.chatId; });
            if (ci !== -1) App.allChats[ci].totalCostUsd = payload.totalCostUsd;
            break;

        case 'AGENT_CHANGED':
            if (payload.chatId === App.activeChatId && payload.agentId) {
                App.agentSelect.value = payload.agentId;
            }
            break;

        case 'AGENT_STARTED':
            App.activeSwarmAgents[payload.chatId] = payload.agentId;
            if (payload.chatId === App.activeChatId) {
                App.showThinking(payload.agentId);
                var chat = App.allChats.find(function(c){ return c.id === payload.chatId; });
                if (chat) App.renderInfoPanel(chat);
            }
            break;

        case 'AGENT_FINISHED':
            if (App.activeSwarmAgents[payload.chatId] === payload.agentId) {
                delete App.activeSwarmAgents[payload.chatId];
            }
            if (payload.chatId === App.activeChatId) {
                App.hideThinking();
                var chat2 = App.allChats.find(function(c){ return c.id === payload.chatId; });
                if (chat2) App.renderInfoPanel(chat2);
            }
            break;

        case 'SWARM_IDLE':
            delete App.activeSwarmAgents[payload.chatId];
            if (payload.chatId === App.activeChatId) {
                App.hideThinking();
                var chat3 = App.allChats.find(function(c){ return c.id === payload.chatId; });
                if (chat3) App.renderInfoPanel(chat3);
            }
            break;

        case 'TOOL_CALL':
            if (payload.chatId === App.activeChatId) {
                var agentLabel = App.shortName(payload.agentId || 'assistant');
                var toolLabel = payload.toolName || 'tool';
                App.updateThinkingLabel(agentLabel + ' \u2192 ' + toolLabel + '\u2026');
            }
            break;

        case 'TOOL_RESULT':
            if (payload.chatId === App.activeChatId) {
                var agentLabel2 = App.shortName(payload.agentId || 'assistant');
                var status = payload.ok === false ? ' \u2717' : ' \u2713';
                App.updateThinkingLabel(agentLabel2 + ' \u2192 ' + (payload.toolName || 'tool') + status);
            }
            break;

        case 'SPENDING_LIMIT_REACHED':
            if (payload.chatId === App.activeChatId) {
                App.spendingBannerText.textContent = 'Spending limit reached at $' + (payload.totalCostUsd||0).toFixed(4) + '. Approve to continue.';
                App.spendingBanner.classList.add('visible');
            }
            break;

        case 'OPEN_CHAT':
            if (payload.chatId) {
                var targetChat = App.allChats.find(function(c){ return c.id === payload.chatId; });
                if (targetChat) {
                    var targetProjectId = targetChat.projectId || null;
                    if (targetProjectId !== App.activeProjectId) {
                        App.activeProjectId = targetProjectId;
                        App.projectSelectEl.value = targetProjectId || '';
                        App.renderChatList();
                    }
                    App.openChat(payload.chatId);
                } else {
                    App._pendingOpenChatId = payload.chatId;
                }
            }
            break;

        case 'CHAT_CREATED':
            if (!App.allChats.some(function(c){ return c.id === payload.id; })) {
                App.allChats.unshift(payload);
            }
            App.renderChatList();
            if (App._pendingOpenChatId && App._pendingOpenChatId === payload.id) {
                var pendingId = App._pendingOpenChatId;
                App._pendingOpenChatId = null;
                var pendingProjectId = payload.projectId || null;
                if (pendingProjectId !== App.activeProjectId) {
                    App.activeProjectId = pendingProjectId;
                    App.projectSelectEl.value = pendingProjectId || '';
                    App.renderChatList();
                }
                App.openChat(pendingId);
            }
            break;

        case 'CHAT_DELETED':
            App.allChats = App.allChats.filter(function(c){ return c.id !== payload.chatId; });
            App.renderChatList();
            break;

        case 'PROJECTS_UPDATED':
            App.allProjects = payload.projects || [];
            App.renderProjectSelector();
            App.renderExportProjectSelect();
            break;
    }
};
