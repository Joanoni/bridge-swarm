// app/ui-chat.js — chat list, openChat, filesPanel, project selector
var App = window.App = window.App || {};

// ── Sidebar drawer (mobile) ───────────────────────────────────────────────────
App.openSidebar = function() {
    App.sidebarEl.classList.add('sidebar-open');
    App.sidebarBackdrop.classList.add('visible');
};
App.closeSidebar = function() {
    App.sidebarEl.classList.remove('sidebar-open');
    App.sidebarBackdrop.classList.remove('visible');
};

// ── Chat list ─────────────────────────────────────────────────────────────────
App.renderChatList = function() {
    App.chatList.innerHTML = '';
    var visibleChats = App.allChats.filter(function(c) {
        if (App.activeProjectId === null) return c.projectId === null || c.projectId === undefined || c.projectId === '';
        return c.projectId === App.activeProjectId;
    });
    if (!visibleChats.length) { App.chatList.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:12px;text-align:center;">No chats yet.</div>'; return; }
    visibleChats.forEach(function(chat) {
        var item = document.createElement('div');
        item.className = 'chat-item' + (chat.id === App.activeChatId ? ' active' : '');
        var color = App.agentColor(chat.id);
        item.innerHTML =
            '<div class="chat-item-icon" style="background:'+color+'22;color:'+color+'">'+(chat.name||'C')[0].toUpperCase()+'</div>'+
            '<div class="chat-item-body">'+
              '<div class="chat-item-name">'+(chat.name||'Untitled')+'</div>'+
              '<div class="chat-item-preview">'+(chat.lastMessage||'No messages yet')+'</div>'+
            '</div>';
        item.addEventListener('click', function() { App.openChat(chat.id); });
        App.chatList.appendChild(item);
    });
};

App.refreshChatList = async function() {
    try {
        var url = '/api/chats';
        if (App.activeProjectId !== undefined) {
            url += App.activeProjectId === null ? '?projectId=' : '?projectId=' + encodeURIComponent(App.activeProjectId);
        }
        var r = await fetch(url); var d = await r.json();
        if (d.ok) { App.allChats = d.chats || []; App.renderChatList(); }
    } catch(e) {}
};

App.switchProject = async function(projectId) {
    App.activeProjectId = projectId;
    App.activeChatId = null;
    App.emptyState.style.display = '';
    App.activeChatEl.style.display = 'none';
    App.infoContent.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">No chat selected.</div>';
    await App.refreshChatList();
};

App.renderProjectSelector = function() {
    App.projectSelectEl.innerHTML = '<option value="">🌐 Global</option>';
    App.allProjects.forEach(function(p) {
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = '📁 ' + p.name;
        if (p.id === App.activeProjectId) opt.selected = true;
        App.projectSelectEl.appendChild(opt);
    });
};

App.projectSelectEl.addEventListener('change', function() {
    var val = App.projectSelectEl.value;
    App.switchProject(val === '' ? null : val);
});

// ── Open chat ─────────────────────────────────────────────────────────────────
App.openChat = async function(chatId) {
    var alreadyOpen = App.activeChatId === chatId && App.activeChatEl.style.display !== 'none';
    App.activeChatId = chatId;
    App.closeSidebar();
    App.renderChatList();
    var chat = App.allChats.find(function(c){ return c.id === chatId; });
    if (!chat) return;

    App.emptyState.style.display = 'none';
    App.activeChatEl.style.display = 'flex';
    App.chatTitle.textContent = chat.name || 'Untitled';
    App.chatCost.textContent = '$' + (chat.totalCostUsd||0).toFixed(4);

    App.chatAgentsBadge.innerHTML = '';
    (chat.agents||[]).forEach(function(aid) {
        var c = App.agentColor(aid), chip = document.createElement('span');
        chip.className = 'agent-chip'; chip.textContent = App.shortName(aid);
        chip.style.cssText = 'background:'+c+'22;color:'+c+';border:1px solid '+c+'44';
        App.chatAgentsBadge.appendChild(chip);
    });

    App.agentSelect.innerHTML = '';
    (chat.agents||[]).forEach(function(aid) {
        var opt = document.createElement('option');
        opt.value = aid; opt.textContent = App.shortName(aid);
        if (aid === chat.activeAgentId) opt.selected = true;
        App.agentSelect.appendChild(opt);
    });

    App.renderInfoPanel(chat);
    App.renderFilesPanel(chatId);

    if (!alreadyOpen) {
        App.messagesEl.innerHTML = '';
        App.userMessageCount = 0;
        try {
            var history = await App.apiChat('GET_HISTORY', { chatId: chatId });
            if (Array.isArray(history)) {
                history.forEach(function(m) {
                    if ((m.role==='user'||m.role==='assistant') && typeof m.content==='string' && m.content)
                        App.appendMessage(m.role, m.content, m.agentId);
                });
            }
        } catch(err) { App.appendError('Failed to load history: '+err.message); }
    }
    App.inputEl.focus();
};

App.renderInfoPanel = function(chat) {
    App.infoContent.innerHTML = '';
    var sec = document.createElement('div'); sec.className = 'info-section';
    var t = document.createElement('div'); t.className = 'info-section-title'; t.textContent = 'Agents';
    sec.appendChild(t);
    (chat.agents||[]).forEach(function(aid) {
        var agent = App.allAgents.find(function(a){ return a.id===aid; });
        var isActive = App.activeSwarmAgents[chat.id] === aid;
        var color = App.agentColor(aid);
        var card = document.createElement('div'); card.className = 'info-agent-card';
        card.innerHTML =
            '<div class="info-agent-name" style="color:'+color+'">'+(agent?agent.name:App.shortName(aid))+'</div>'+
            '<div class="info-agent-id">'+aid+'</div>'+
            '<div class="info-agent-status'+(isActive?' active':'')+'">'+
              '<div class="status-dot"></div><span>'+(isActive?'Running':'Idle')+'</span>'+
            '</div>';
        sec.appendChild(card);
    });
    App.infoContent.appendChild(sec);

    if (chat.projectId) {
        var proj = App.allProjects.find(function(p){ return p.id===chat.projectId; });
        if (proj) {
            var ps = document.createElement('div'); ps.className = 'info-section';
            ps.innerHTML = '<div class="info-section-title">Project</div>'+
                '<div style="font-size:12px;font-weight:600;margin-bottom:2px;">'+proj.name+'</div>'+
                '<div style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono);word-break:break-all;">'+proj.path+'</div>';
            App.infoContent.appendChild(ps);
        }
    }
};

// ── Files panel ───────────────────────────────────────────────────────────────
App.renderFilesPanel = async function(chatId) {
    if (!chatId) { App.filesPanelEl.style.display = 'none'; return; }
    App.filesPanelEl.style.display = '';
    var files = await App.loadChatFiles(chatId);
    App.filesPanelList.innerHTML = '';
    if (!files.length) {
        App.filesPanelList.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px 12px;">No files attached.</div>';
        return;
    }
    files.forEach(function(f) {
        var row = document.createElement('div'); row.className = 'files-panel-row';
        var name = document.createElement('span'); name.className = 'files-panel-name'; name.textContent = f; name.title = f;
        var del = document.createElement('button'); del.className = 'files-panel-del btn-icon danger'; del.textContent = '✕'; del.title = 'Remove file';
        del.addEventListener('click', async function() {
            try { await App.deleteChatFile(chatId, f); await App.renderFilesPanel(chatId); } catch(e) { alert('Delete failed: ' + e.message); }
        });
        row.appendChild(name); row.appendChild(del);
        App.filesPanelList.appendChild(row);
    });
};

// ── Autocomplete ──────────────────────────────────────────────────────────────
App.getAtQuery = function() {
    var val = App.inputEl.value, cursor = App.inputEl.selectionStart;
    var before = val.slice(0, cursor), match = before.match(/@([\w\-\/]*)$/);
    return match ? { query: match[1], start: cursor - match[0].length } : null;
};

App.showAutocomplete = function(items, atStart) {
    App.autocompleteEl.innerHTML = ''; App.acActiveIndex = -1;
    if (!items.length) { App.hideAutocomplete(); return; }
    items.forEach(function(item) {
        var div = document.createElement('div'); div.className = 'autocomplete-item';
        var color = App.agentColor(item.id);
        div.innerHTML = '<span class="ac-id" style="color:'+color+'">@'+item.id+'</span>'+(item.description?'<span class="ac-desc">'+item.description+'</span>':'');
        div.addEventListener('mousedown', function(e) { e.preventDefault(); App.applyAutocomplete(item.id, atStart); });
        App.autocompleteEl.appendChild(div);
    });
    var rect = App.inputEl.getBoundingClientRect();
    App.autocompleteEl.style.display = 'block';
    App.autocompleteEl.style.left = rect.left + 'px';
    App.autocompleteEl.style.width = rect.width + 'px';
    var acH = Math.min(items.length * 52, 220);
    App.autocompleteEl.style.top = (rect.top - acH - 6) + 'px';
};

App.hideAutocomplete = function() { App.autocompleteEl.style.display = 'none'; App.acActiveIndex = -1; };

App.applyAutocomplete = function(agentId, atStart) {
    var val = App.inputEl.value, afterAt = val.slice(atStart + 1);
    var wordEnd = afterAt.search(/[^\w\-\/]/);
    var replaceEnd = atStart + 1 + (wordEnd === -1 ? afterAt.length : wordEnd);
    App.inputEl.value = val.slice(0, atStart) + '@' + agentId + val.slice(replaceEnd);
    var newCursor = atStart + 1 + agentId.length;
    App.inputEl.setSelectionRange(newCursor, newCursor);
    App.hideAutocomplete(); App.inputEl.focus();
};

App.updateAutocomplete = function() {
    var q = App.getAtQuery(); if (!q) { App.hideAutocomplete(); return; }
    var query = q.query.toLowerCase();
    var candidates = [{ id: 'user', name: 'User', description: 'Return control to the user' }].concat(App.allAgents);
    var filtered = candidates.filter(function(a) { return a.id.toLowerCase().includes(query) || (a.name && a.name.toLowerCase().includes(query)); });
    App.showAutocomplete(filtered, q.start);
};

// ── New Chat modal ────────────────────────────────────────────────────────────
App.openNewChatModal = function() {
    App.newChatName.value = ''; App.newChatFeedback.textContent = ''; App.newChatFeedback.className = '';
    App.newChatProject.innerHTML = '<option value="">— No project —</option>';
    App.allProjects.forEach(function(p) {
        var opt = document.createElement('option'); opt.value = p.id; opt.textContent = p.name;
        if (p.id === App.activeProjectId) opt.selected = true;
        App.newChatProject.appendChild(opt);
    });
    App.newChatAgentsList.innerHTML = '';
    var others = App.allAgents.filter(function(a){ return a.id !== 'swarmito'; });
    if (!others.length) {
        App.newChatAgentsList.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">No other agents available.</div>';
    } else {
        others.forEach(function(agent) {
            var label = document.createElement('label'); label.className = 'agent-checkbox-item';
            var cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = agent.id;
            var ns = document.createElement('span'); ns.className = 'agent-checkbox-label'; ns.textContent = agent.name; ns.style.color = App.agentColor(agent.id);
            var ds = document.createElement('span'); ds.className = 'agent-checkbox-desc'; ds.textContent = agent.description||'';
            label.appendChild(cb); label.appendChild(ns); label.appendChild(ds);
            App.newChatAgentsList.appendChild(label);
        });
    }
    App.newChatOverlay.classList.add('visible'); App.newChatName.focus();
};
