// app/ui-messages.js — message rendering functions
var App = window.App = window.App || {};

App.appendMessage = function(role, content, agentId) {
    var wrap = document.createElement('div'); wrap.className = 'message-wrap '+role;

    if (role === 'user') {
        var msgIndex = App.userMessageCount++;
        var editBtn = document.createElement('button');
        editBtn.className = 'msg-edit-btn';
        editBtn.textContent = '✎ Edit';
        editBtn.addEventListener('click', function() { App.startEditMessage(wrap, msgIndex, content); });
        wrap.appendChild(editBtn);
    }

    if (role==='assistant' && agentId) {
        var color = App.agentColor(agentId);
        var meta = document.createElement('div'); meta.className = 'message-meta';
        meta.innerHTML = '<span class="agent-badge" style="background:'+color+'22;color:'+color+';border:1px solid '+color+'44">'+App.shortName(agentId)+'</span>';
        wrap.appendChild(meta);
    }
    var el = document.createElement('div');
    var tool = role==='assistant' && App.isToolSummary(content);
    el.className = 'message '+role+(tool?' tool-summary':'');
    if (tool || role==='user') el.textContent = content; else el.innerHTML = App.md(content);
    wrap.appendChild(el);
    App.messagesEl.appendChild(wrap);
    App.messagesEl.scrollTop = App.messagesEl.scrollHeight;
    return el;
};

App.startEditMessage = function(wrap, msgIndex, originalContent) {
    if (App.isLoading) return;
    wrap.innerHTML = '';

    var editArea = document.createElement('div');
    editArea.className = 'message-edit-area';

    var textarea = document.createElement('textarea');
    textarea.className = 'message-edit-textarea';
    textarea.value = originalContent;

    var actions = document.createElement('div');
    actions.className = 'message-edit-actions';

    var confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn-edit-confirm';
    confirmBtn.textContent = 'Send';

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-edit-cancel';
    cancelBtn.textContent = 'Cancel';

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    editArea.appendChild(textarea);
    editArea.appendChild(actions);
    wrap.appendChild(editArea);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    cancelBtn.addEventListener('click', function() {
        wrap.innerHTML = '';
        var editBtn2 = document.createElement('button');
        editBtn2.className = 'msg-edit-btn';
        editBtn2.textContent = '✎ Edit';
        editBtn2.addEventListener('click', function() { App.startEditMessage(wrap, msgIndex, originalContent); });
        wrap.appendChild(editBtn2);
        var el2 = document.createElement('div');
        el2.className = 'message user';
        el2.textContent = originalContent;
        wrap.appendChild(el2);
    });

    confirmBtn.addEventListener('click', async function() {
        var newContent = textarea.value.trim();
        if (!newContent || !App.activeChatId) return;
        confirmBtn.disabled = true;
        try {
            var allWraps = Array.from(App.messagesEl.children);
            var wrapIdx = allWraps.indexOf(wrap);
            for (var i = allWraps.length - 1; i > wrapIdx; i--) {
                App.messagesEl.removeChild(allWraps[i]);
            }
            App.userMessageCount = msgIndex + 1;
            wrap.innerHTML = '';
            var editBtn3 = document.createElement('button');
            editBtn3.className = 'msg-edit-btn';
            editBtn3.textContent = '✎ Edit';
            editBtn3.addEventListener('click', function() { App.startEditMessage(wrap, msgIndex, newContent); });
            wrap.appendChild(editBtn3);
            var el3 = document.createElement('div');
            el3.className = 'message user';
            el3.textContent = newContent;
            wrap.appendChild(el3);

            App.setLoading(true);
            App.showThinking(App.activeSwarmAgents[App.activeChatId] || App.agentSelect.value);
            await App.apiChat('EDIT_MESSAGE', { chatId: App.activeChatId, messageIndex: msgIndex, newContent: newContent });
        } catch(err) {
            App.hideThinking();
            App.appendError('Edit failed: ' + err.message);
        } finally {
            App.setLoading(false);
        }
    });

    textarea.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmBtn.click(); }
        if (e.key === 'Escape') { cancelBtn.click(); }
    });
};

App.appendError = function(text) {
    var wrap = document.createElement('div'); wrap.className = 'message-wrap assistant';
    var el = document.createElement('div'); el.className = 'message error'; el.textContent = text;
    wrap.appendChild(el); App.messagesEl.appendChild(wrap); App.messagesEl.scrollTop = App.messagesEl.scrollHeight;
};

App.showThinking = function(agentId) {
    App.hideThinking();
    App.thinkingEl = document.createElement('div'); App.thinkingEl.className = 'thinking-indicator';
    var dots = document.createElement('div'); dots.className = 'thinking-dots';
    dots.innerHTML = '<span></span><span></span><span></span>';
    var label = document.createElement('span');
    label.className = 'thinking-label';
    label.textContent = App.shortName(agentId||'assistant') + ' is thinking\u2026';
    if (agentId) label.style.color = App.agentColor(agentId);
    App.thinkingEl.appendChild(dots); App.thinkingEl.appendChild(label);
    App.messagesEl.appendChild(App.thinkingEl); App.messagesEl.scrollTop = App.messagesEl.scrollHeight;
};

App.hideThinking = function() { if (App.thinkingEl) { App.thinkingEl.remove(); App.thinkingEl = null; } };

App.updateThinkingLabel = function(text) {
    if (!App.thinkingEl) return;
    var label = App.thinkingEl.querySelector('.thinking-label');
    if (label) label.textContent = text;
    App.messagesEl.scrollTop = App.messagesEl.scrollHeight;
};

App.setLoading = function(v) { App.isLoading = v; App.sendBtn.disabled = v; App.inputEl.disabled = v; };
