(function () {
'use strict';

// ── DOM ───────────────────────────────────────────────────────────────────────
var $ = function(id) { return document.getElementById(id); };
var chatList = $('chat-list'), newChatBtn = $('new-chat-btn'), settingsBtn = $('settings-btn');
var emptyState = $('empty-state'), activeChatEl = $('active-chat');
var chatTitle = $('chat-title'), chatAgentsBadge = $('chat-agents-badge'), chatCost = $('chat-cost');
var clearBtn = $('clear-btn'), deleteChatBtn = $('delete-chat-btn');
var messagesEl = $('messages'), spendingBanner = $('spending-banner');
var spendingBannerText = $('spending-banner-text'), continueBtn = $('continue-btn');
var agentSelect = $('agent-select'), inputEl = $('user-input'), sendBtn = $('send-btn');
var autocompleteEl = $('autocomplete'), infoContent = $('info-content');
var globalCost = $('global-cost'), connStatus = $('conn-status');
var projectSelectEl = $('project-select');
var sidebarEl = $('sidebar');
var sidebarToggle = $('sidebar-toggle');
var sidebarBackdrop = $('sidebar-backdrop');
// New chat modal
var newChatOverlay = $('new-chat-overlay'), closeNewChat = $('close-new-chat');
var newChatName = $('new-chat-name'), newChatProject = $('new-chat-project');
var newChatAgentsList = $('new-chat-agents-list'), createChatBtn = $('create-chat-btn');
var newChatFeedback = $('new-chat-feedback');
// Settings modal
var settingsOverlay = $('settings-overlay'), closeSettings = $('close-settings');
var providerSelect = $('provider-select'), modelSelect = $('model-select');
var apiKeyInput = $('api-key-input'), spendingLimitInput = $('spending-limit-input');
var tavilyKeyInput = $('tavily-key-input'), toggleTavilyKeyBtn = $('toggle-tavily-key');
var cfAccountIdInput = $('cf-account-id-input'), toggleCfAccountIdBtn = $('toggle-cf-account-id');
var cfApiTokenInput = $('cf-api-token-input'), toggleCfApiTokenBtn = $('toggle-cf-api-token');
var toggleKeyBtn = $('toggle-key'), saveSettingsBtn = $('save-settings-btn');
var settingsFeedback = $('settings-feedback'), projectsList = $('projects-list');
var saveTavilyBtn = $('save-tavily-btn'), tavilyFeedback = $('tavily-feedback');
var saveCloudflareBtn = $('save-cloudflare-btn'), cloudflareFeedback = $('cloudflare-feedback');
var newProjectName = $('new-project-name');
var addProjectBtn = $('add-project-btn'), projectsFeedback = $('projects-feedback');
var agentListEl = $('agent-list');
var resetBtn = $('reset-btn'), resetFeedback = $('reset-feedback');

// ── State ─────────────────────────────────────────────────────────────────────
var allChats = [], activeChatId = null, allAgents = [], allProjects = [];
var availableProviders = [], activeSwarmAgents = {};
var isLoading = false, thinkingEl = null, acActiveIndex = -1;
var _pendingOpenChatId = null;
var activeProjectId = null; // null = global

// ── Sidebar drawer (mobile) ───────────────────────────────────────────────────
function openSidebar() {
    sidebarEl.classList.add('sidebar-open');
    sidebarBackdrop.classList.add('visible');
}
function closeSidebar() {
    sidebarEl.classList.remove('sidebar-open');
    sidebarBackdrop.classList.remove('visible');
}
sidebarToggle.addEventListener('click', openSidebar);
sidebarBackdrop.addEventListener('click', closeSidebar);

// ── Colors ────────────────────────────────────────────────────────────────────
var COLORS = ['#7c6af7','#48bb78','#63b3ed','#ecc94b','#fc8181','#f6ad55','#76e4f7','#b794f4','#68d391','#fbb6ce'];
function agentColor(id) {
    if (!id || id === 'user') return '#8892b0';
    var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return COLORS[Math.abs(h) % COLORS.length];
}
function shortName(id) { return id ? id.split('/').pop() : 'assistant'; }

// ── Markdown ──────────────────────────────────────────────────────────────────
function md(text) {
    if (!text) return '';
    var h = text
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/```[\w]*\n?([\s\S]*?)```/g, function(_,c){ return '<pre><code>'+c.trim()+'</code></pre>'; })
        .replace(/`([^`\n]+)`/g,'<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
        .replace(/\*([^*\n]+)\*/g,'<em>$1</em>')
        .replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^# (.+)$/gm,'<h1>$1</h1>')
        .replace(/^\s*[-*] (.+)$/gm,'<li>$1</li>').replace(/^\s*\d+\. (.+)$/gm,'<li>$1</li>');
    h = h.replace(/(<li>[\s\S]*?<\/li>(\s*<li>[\s\S]*?<\/li>)*)/g,'<ul>$1</ul>');
    var lines = h.split('\n'), res = [], inPre = false;
    lines.forEach(function(l) {
        if (l.startsWith('<pre>')) inPre = true;
        if (l.startsWith('</pre>')) inPre = false;
        if (!inPre && l.trim() && !/^<(h[123]|ul|li|pre)/.test(l)) res.push('<p>'+l+'</p>');
        else res.push(l);
    });
    return res.join('\n');
}
function isToolSummary(c) { return /^\[[\w\-\/]+\] [📄✏️📁💻🔍]/.test(c); }

// ── API ───────────────────────────────────────────────────────────────────────
async function apiChat(cmd, payload) {
    var r = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({command:cmd, payload:payload||{}}) });
    var d = await r.json(); if (!d.ok) throw new Error(d.error||'Unknown error'); return d.result;
}
async function apiPost(url, body) {
    var r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    var d = await r.json(); if (!d.ok) throw new Error(d.error||'Unknown error'); return d;
}
async function apiDelete(url) {
    var r = await fetch(url, { method:'DELETE' }); var d = await r.json();
    if (!d.ok) throw new Error(d.error||'Unknown error'); return d;
}

// ── Chat list ─────────────────────────────────────────────────────────────────
function renderChatList() {
    chatList.innerHTML = '';
    if (!allChats.length) { chatList.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:12px;text-align:center;">No chats yet.</div>'; return; }
    allChats.forEach(function(chat) {
        var item = document.createElement('div');
        item.className = 'chat-item' + (chat.id === activeChatId ? ' active' : '');
        var color = agentColor(chat.id);
        item.innerHTML =
            '<div class="chat-item-icon" style="background:'+color+'22;color:'+color+'">'+(chat.name||'C')[0].toUpperCase()+'</div>'+
            '<div class="chat-item-body">'+
              '<div class="chat-item-name">'+(chat.name||'Untitled')+'</div>'+
              '<div class="chat-item-preview">'+(chat.lastMessage||'No messages yet')+'</div>'+
            '</div>';
        item.addEventListener('click', function() { openChat(chat.id); });
        chatList.appendChild(item);
    });
}

async function refreshChatList() {
    try {
        var url = '/api/chats';
        if (activeProjectId !== undefined) {
            url += activeProjectId === null ? '?projectId=' : '?projectId=' + encodeURIComponent(activeProjectId);
        }
        var r = await fetch(url); var d = await r.json();
        if (d.ok) { allChats = d.chats || []; renderChatList(); }
    } catch(e) {}
}

async function switchProject(projectId) {
    activeProjectId = projectId;
    activeChatId = null;
    emptyState.style.display = '';
    activeChatEl.style.display = 'none';
    infoContent.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">No chat selected.</div>';
    await refreshChatList();
}

function renderProjectSelector() {
    projectSelectEl.innerHTML = '<option value="">🌐 Global</option>';
    allProjects.forEach(function(p) {
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = '📁 ' + p.name;
        if (p.id === activeProjectId) opt.selected = true;
        projectSelectEl.appendChild(opt);
    });
}

projectSelectEl.addEventListener('change', function() {
    var val = projectSelectEl.value;
    switchProject(val === '' ? null : val);
});

// ── Open chat ─────────────────────────────────────────────────────────────────
async function openChat(chatId) {
    var alreadyOpen = activeChatId === chatId && activeChatEl.style.display !== 'none';
    activeChatId = chatId;
    closeSidebar();
    renderChatList();
    var chat = allChats.find(function(c){ return c.id === chatId; });
    if (!chat) return;

    emptyState.style.display = 'none';
    activeChatEl.style.display = 'flex';
    chatTitle.textContent = chat.name || 'Untitled';
    chatCost.textContent = '$' + (chat.totalCostUsd||0).toFixed(4);

    // Agents badge
    chatAgentsBadge.innerHTML = '';
    (chat.agents||[]).forEach(function(aid) {
        var c = agentColor(aid), chip = document.createElement('span');
        chip.className = 'agent-chip'; chip.textContent = shortName(aid);
        chip.style.cssText = 'background:'+c+'22;color:'+c+';border:1px solid '+c+'44';
        chatAgentsBadge.appendChild(chip);
    });

    // Agent select
    agentSelect.innerHTML = '';
    (chat.agents||[]).forEach(function(aid) {
        var opt = document.createElement('option');
        opt.value = aid; opt.textContent = shortName(aid);
        if (aid === chat.activeAgentId) opt.selected = true;
        agentSelect.appendChild(opt);
    });

    renderInfoPanel(chat);

    // Only reload history when switching to a different chat
    if (!alreadyOpen) {
        messagesEl.innerHTML = '';
        userMessageCount = 0;
        try {
            var history = await apiChat('GET_HISTORY', { chatId: chatId });
            if (Array.isArray(history)) {
                history.forEach(function(m) {
                    if ((m.role==='user'||m.role==='assistant') && typeof m.content==='string' && m.content)
                        appendMessage(m.role, m.content, m.agentId);
                });
            }
        } catch(err) { appendError('Failed to load history: '+err.message); }
    }
    inputEl.focus();
}

function renderInfoPanel(chat) {
    infoContent.innerHTML = '';
    var sec = document.createElement('div'); sec.className = 'info-section';
    var t = document.createElement('div'); t.className = 'info-section-title'; t.textContent = 'Agents';
    sec.appendChild(t);
    (chat.agents||[]).forEach(function(aid) {
        var agent = allAgents.find(function(a){ return a.id===aid; });
        var isActive = activeSwarmAgents[chat.id] === aid;
        var color = agentColor(aid);
        var card = document.createElement('div'); card.className = 'info-agent-card';
        card.innerHTML =
            '<div class="info-agent-name" style="color:'+color+'">'+(agent?agent.name:shortName(aid))+'</div>'+
            '<div class="info-agent-id">'+aid+'</div>'+
            '<div class="info-agent-status'+(isActive?' active':'')+'">'+
              '<div class="status-dot"></div><span>'+(isActive?'Running':'Idle')+'</span>'+
            '</div>';
        sec.appendChild(card);
    });
    infoContent.appendChild(sec);

    if (chat.projectId) {
        var proj = allProjects.find(function(p){ return p.id===chat.projectId; });
        if (proj) {
            var ps = document.createElement('div'); ps.className = 'info-section';
            ps.innerHTML = '<div class="info-section-title">Project</div>'+
                '<div style="font-size:12px;font-weight:600;margin-bottom:2px;">'+proj.name+'</div>'+
                '<div style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono);word-break:break-all;">'+proj.path+'</div>';
            infoContent.appendChild(ps);
        }
    }
}

// ── Messages ──────────────────────────────────────────────────────────────────
var userMessageCount = 0; // tracks index of user messages for edit

function appendMessage(role, content, agentId) {
    var wrap = document.createElement('div'); wrap.className = 'message-wrap '+role;

    if (role === 'user') {
        var msgIndex = userMessageCount++;
        // Edit button (shown on hover via CSS)
        var editBtn = document.createElement('button');
        editBtn.className = 'msg-edit-btn';
        editBtn.textContent = '✎ Edit';
        editBtn.addEventListener('click', function() { startEditMessage(wrap, msgIndex, content); });
        wrap.appendChild(editBtn);
    }

    if (role==='assistant' && agentId) {
        var color = agentColor(agentId);
        var meta = document.createElement('div'); meta.className = 'message-meta';
        meta.innerHTML = '<span class="agent-badge" style="background:'+color+'22;color:'+color+';border:1px solid '+color+'44">'+shortName(agentId)+'</span>';
        wrap.appendChild(meta);
    }
    var el = document.createElement('div');
    var tool = role==='assistant' && isToolSummary(content);
    el.className = 'message '+role+(tool?' tool-summary':'');
    if (tool || role==='user') el.textContent = content; else el.innerHTML = md(content);
    wrap.appendChild(el);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
}

function startEditMessage(wrap, msgIndex, originalContent) {
    if (isLoading) return;
    // Replace message content with inline editor
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
        // Restore original message
        wrap.innerHTML = '';
        var editBtn2 = document.createElement('button');
        editBtn2.className = 'msg-edit-btn';
        editBtn2.textContent = '✎ Edit';
        editBtn2.addEventListener('click', function() { startEditMessage(wrap, msgIndex, originalContent); });
        wrap.appendChild(editBtn2);
        var el2 = document.createElement('div');
        el2.className = 'message user';
        el2.textContent = originalContent;
        wrap.appendChild(el2);
    });

    confirmBtn.addEventListener('click', async function() {
        var newContent = textarea.value.trim();
        if (!newContent || !activeChatId) return;
        confirmBtn.disabled = true;
        try {
            // Remove all messages from this point forward in the DOM
            var allWraps = Array.from(messagesEl.children);
            var wrapIdx = allWraps.indexOf(wrap);
            for (var i = allWraps.length - 1; i > wrapIdx; i--) {
                messagesEl.removeChild(allWraps[i]);
            }
            // Reset user message count to msgIndex + 1
            userMessageCount = msgIndex + 1;
            // Update the wrap to show the new content
            wrap.innerHTML = '';
            var editBtn3 = document.createElement('button');
            editBtn3.className = 'msg-edit-btn';
            editBtn3.textContent = '✎ Edit';
            editBtn3.addEventListener('click', function() { startEditMessage(wrap, msgIndex, newContent); });
            wrap.appendChild(editBtn3);
            var el3 = document.createElement('div');
            el3.className = 'message user';
            el3.textContent = newContent;
            wrap.appendChild(el3);

            setLoading(true);
            showThinking(activeSwarmAgents[activeChatId] || agentSelect.value);
            await apiChat('EDIT_MESSAGE', { chatId: activeChatId, messageIndex: msgIndex, newContent: newContent });
        } catch(err) {
            hideThinking();
            appendError('Edit failed: ' + err.message);
        } finally {
            setLoading(false);
        }
    });

    textarea.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmBtn.click(); }
        if (e.key === 'Escape') { cancelBtn.click(); }
    });
}

function appendError(text) {
    var wrap = document.createElement('div'); wrap.className = 'message-wrap assistant';
    var el = document.createElement('div'); el.className = 'message error'; el.textContent = text;
    wrap.appendChild(el); messagesEl.appendChild(wrap); messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showThinking(agentId) {
    hideThinking();
    thinkingEl = document.createElement('div'); thinkingEl.className = 'thinking-indicator';
    var dots = document.createElement('div'); dots.className = 'thinking-dots';
    dots.innerHTML = '<span></span><span></span><span></span>';
    var label = document.createElement('span');
    label.className = 'thinking-label';
    label.textContent = shortName(agentId||'assistant') + ' is thinking\u2026';
    if (agentId) label.style.color = agentColor(agentId);
    thinkingEl.appendChild(dots); thinkingEl.appendChild(label);
    messagesEl.appendChild(thinkingEl); messagesEl.scrollTop = messagesEl.scrollHeight;
}
function hideThinking() { if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; } }
function updateThinkingLabel(text) {
    if (!thinkingEl) return;
    var label = thinkingEl.querySelector('.thinking-label');
    if (label) label.textContent = text;
    messagesEl.scrollTop = messagesEl.scrollHeight;
}
function setLoading(v) { isLoading = v; sendBtn.disabled = v; inputEl.disabled = v; }

// ── Send ──────────────────────────────────────────────────────────────────────
async function sendMessage() {
    var content = inputEl.value.trim();
    if (!content || isLoading || !activeChatId) return;
    inputEl.value = ''; inputEl.style.height = 'auto'; hideAutocomplete();
    appendMessage('user', content);
    setLoading(true); showThinking(activeSwarmAgents[activeChatId] || agentSelect.value);
    try { await apiChat('SEND_MESSAGE', { chatId: activeChatId, content: content }); }
    catch(err) { hideThinking(); appendError('Error: '+err.message); }
    finally { setLoading(false); inputEl.focus(); }
}

sendBtn.addEventListener('click', sendMessage);
inputEl.addEventListener('keydown', function(e) {
    var acVis = autocompleteEl.style.display === 'block';
    if (!acVis && e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); return; }
    if (acVis) {
        var items = autocompleteEl.querySelectorAll('.autocomplete-item');
        if (e.key==='ArrowDown') { e.preventDefault(); if(acActiveIndex>=0) items[acActiveIndex].classList.remove('active'); acActiveIndex=(acActiveIndex+1)%items.length; items[acActiveIndex].classList.add('active'); items[acActiveIndex].scrollIntoView({block:'nearest'}); return; }
        if (e.key==='ArrowUp') { e.preventDefault(); if(acActiveIndex>=0) items[acActiveIndex].classList.remove('active'); acActiveIndex=(acActiveIndex-1+items.length)%items.length; items[acActiveIndex].classList.add('active'); items[acActiveIndex].scrollIntoView({block:'nearest'}); return; }
        if (e.key==='Enter' && acActiveIndex>=0) { e.preventDefault(); var q=getAtQuery(); var cands=[{id:'user',name:'User',description:''}].concat(allAgents); var qry=(q?q.query:'').toLowerCase(); var filt=cands.filter(function(a){ return a.id.toLowerCase().includes(qry)||(a.name&&a.name.toLowerCase().includes(qry)); }); if(filt[acActiveIndex]) applyAutocomplete(filt[acActiveIndex].id, q.start); return; }
        if (e.key==='Escape') { hideAutocomplete(); return; }
    }
});
inputEl.addEventListener('input', function() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
    updateAutocomplete();
});

agentSelect.addEventListener('change', async function() {
    if (!activeChatId) return;
    try { await apiChat('SET_AGENT', { chatId: activeChatId, agentId: agentSelect.value }); }
    catch(err) { appendError('Failed to switch agent: '+err.message); }
});

clearBtn.addEventListener('click', async function() {
    if (!activeChatId) return;
    try { await apiChat('CLEAR_HISTORY', { chatId: activeChatId }); messagesEl.innerHTML = ''; chatCost.textContent = '$0.0000'; }
    catch(err) { appendError('Failed to clear: '+err.message); }
});

deleteChatBtn.addEventListener('click', async function() {
    if (!activeChatId || !confirm('Delete this chat?')) return;
    try {
        await apiChat('DELETE_CHAT', { chatId: activeChatId });
        allChats = allChats.filter(function(c){ return c.id !== activeChatId; });
        activeChatId = null; renderChatList();
        emptyState.style.display = ''; activeChatEl.style.display = 'none';
        infoContent.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">No chat selected.</div>';
    } catch(err) { appendError('Failed to delete: '+err.message); }
});

continueBtn.addEventListener('click', async function() {
    spendingBanner.classList.remove('visible');
    try { await apiChat('RESUME_TURN', { chatId: activeChatId }); }
    catch(err) { appendError('Failed to resume: '+err.message); }
});

// ── New Chat modal ────────────────────────────────────────────────────────────
newChatBtn.addEventListener('click', openNewChatModal);
closeNewChat.addEventListener('click', function(){ newChatOverlay.classList.remove('visible'); });
newChatOverlay.addEventListener('click', function(e){ if(e.target===newChatOverlay) newChatOverlay.classList.remove('visible'); });

function openNewChatModal() {
    newChatName.value = ''; newChatFeedback.textContent = ''; newChatFeedback.className = '';
    newChatProject.innerHTML = '<option value="">— No project —</option>';
    allProjects.forEach(function(p) {
        var opt = document.createElement('option'); opt.value = p.id; opt.textContent = p.name;
        if (p.id === activeProjectId) opt.selected = true;
        newChatProject.appendChild(opt);
    });
    newChatAgentsList.innerHTML = '';
    var others = allAgents.filter(function(a){ return a.id !== 'swarmito'; });
    if (!others.length) {
        newChatAgentsList.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">No other agents available.</div>';
    } else {
        others.forEach(function(agent) {
            var label = document.createElement('label'); label.className = 'agent-checkbox-item';
            var cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = agent.id;
            var ns = document.createElement('span'); ns.className = 'agent-checkbox-label'; ns.textContent = agent.name; ns.style.color = agentColor(agent.id);
            var ds = document.createElement('span'); ds.className = 'agent-checkbox-desc'; ds.textContent = agent.description||'';
            label.appendChild(cb); label.appendChild(ns); label.appendChild(ds);
            newChatAgentsList.appendChild(label);
        });
    }
    newChatOverlay.classList.add('visible'); newChatName.focus();
}

createChatBtn.addEventListener('click', async function() {
    var name = newChatName.value.trim();
    if (!name) { newChatFeedback.textContent = 'Chat name is required.'; newChatFeedback.className = 'error'; return; }
    var selectedAgents = Array.from(newChatAgentsList.querySelectorAll('input[type="checkbox"]:checked')).map(function(cb){ return cb.value; });
    var projectId = newChatProject.value || null;
    createChatBtn.disabled = true;
    try {
        var result = await apiChat('CREATE_CHAT', { name: name, agents: selectedAgents, projectId: projectId });
        newChatOverlay.classList.remove('visible');
        await refreshChatList();
        openChat(result.chatId);
    } catch(err) { newChatFeedback.textContent = 'Error: '+err.message; newChatFeedback.className = 'error'; }
    finally { createChatBtn.disabled = false; }
});

// ── Settings modal ────────────────────────────────────────────────────────────
settingsBtn.addEventListener('click', function(){ loadSettings(); settingsOverlay.classList.add('visible'); });
closeSettings.addEventListener('click', function(){ settingsOverlay.classList.remove('visible'); });
settingsOverlay.addEventListener('click', function(e){ if(e.target===settingsOverlay) settingsOverlay.classList.remove('visible'); });

toggleTavilyKeyBtn.addEventListener('click', function() {
    var isPass = tavilyKeyInput.type === 'password';
    tavilyKeyInput.type = isPass ? 'text' : 'password';
    toggleTavilyKeyBtn.textContent = isPass ? 'Hide' : 'Show';
});
toggleKeyBtn.addEventListener('click', function() {
    var isPass = apiKeyInput.type === 'password';
    apiKeyInput.type = isPass ? 'text' : 'password';
    toggleKeyBtn.textContent = isPass ? 'Hide' : 'Show';
});
toggleCfAccountIdBtn.addEventListener('click', function() {
    var isPass = cfAccountIdInput.type === 'password';
    cfAccountIdInput.type = isPass ? 'text' : 'password';
    toggleCfAccountIdBtn.textContent = isPass ? 'Hide' : 'Show';
});
toggleCfApiTokenBtn.addEventListener('click', function() {
    var isPass = cfApiTokenInput.type === 'password';
    cfApiTokenInput.type = isPass ? 'text' : 'password';
    toggleCfApiTokenBtn.textContent = isPass ? 'Hide' : 'Show';
});

providerSelect.addEventListener('change', function(){ populateModels(providerSelect.value, null); });

function populateModels(providerId, selectedModelId) {
    var provider = availableProviders.find(function(p){ return p.id===providerId; });
    modelSelect.innerHTML = '';
    if (!provider) return;
    provider.models.forEach(function(m) {
        var opt = document.createElement('option'); opt.value = m.id; opt.textContent = m.name;
        if (m.id === selectedModelId) opt.selected = true;
        modelSelect.appendChild(opt);
    });
}

async function loadSettings() {
    try {
        var s = await apiChat('GET_SETTINGS_WITH_KEY');
        availableProviders = s.availableProviders || [];
        providerSelect.innerHTML = '';
        availableProviders.forEach(function(p) {
            var opt = document.createElement('option'); opt.value = p.id; opt.textContent = p.name;
            if (p.id === s.provider) opt.selected = true;
            providerSelect.appendChild(opt);
        });
        populateModels(s.provider, s.model);
        apiKeyInput.value = s.apiKey || '';
        tavilyKeyInput.value = s.tavilyApiKey || '';
        spendingLimitInput.value = s.spendingLimit || 0;
        cfAccountIdInput.value = s.cloudflareAccountId || '';
        cfApiTokenInput.value = s.cloudflareApiToken || '';
        allProjects = s.projects || [];
        renderProjectsList();
        renderProjectSelector();
        renderAgentList(s.agents || []);
    } catch(err) { settingsFeedback.textContent = 'Failed to load: '+err.message; settingsFeedback.className = 'error'; }
}

saveSettingsBtn.addEventListener('click', async function() {
    saveSettingsBtn.disabled = true; settingsFeedback.textContent = ''; settingsFeedback.className = '';
    try {
        await apiChat('SAVE_SETTINGS', { provider: providerSelect.value, model: modelSelect.value, apiKey: apiKeyInput.value, spendingLimit: parseFloat(spendingLimitInput.value)||0 });
        settingsFeedback.textContent = 'Settings saved.'; settingsFeedback.className = 'success';
        setTimeout(function(){ if(settingsFeedback.textContent==='Settings saved.'){ settingsFeedback.textContent=''; settingsFeedback.className=''; } }, 3000);
    } catch(err) { settingsFeedback.textContent = 'Error: '+err.message; settingsFeedback.className = 'error'; }
    finally { saveSettingsBtn.disabled = false; }
});

saveTavilyBtn.addEventListener('click', async function() {
    saveTavilyBtn.disabled = true; tavilyFeedback.textContent = ''; tavilyFeedback.className = '';
    try {
        await apiChat('SAVE_SETTINGS', { tavilyApiKey: tavilyKeyInput.value });
        tavilyFeedback.textContent = 'Tavily key saved.'; tavilyFeedback.className = 'success';
        setTimeout(function(){ if(tavilyFeedback.textContent==='Tavily key saved.'){ tavilyFeedback.textContent=''; tavilyFeedback.className=''; } }, 3000);
    } catch(err) { tavilyFeedback.textContent = 'Error: '+err.message; tavilyFeedback.className = 'error'; }
    finally { saveTavilyBtn.disabled = false; }
});

saveCloudflareBtn.addEventListener('click', async function() {
    saveCloudflareBtn.disabled = true; cloudflareFeedback.textContent = ''; cloudflareFeedback.className = '';
    try {
        await apiChat('SAVE_SETTINGS', { cloudflareAccountId: cfAccountIdInput.value, cloudflareApiToken: cfApiTokenInput.value });
        cloudflareFeedback.textContent = 'Cloudflare keys saved.'; cloudflareFeedback.className = 'success';
        setTimeout(function(){ if(cloudflareFeedback.textContent==='Cloudflare keys saved.'){ cloudflareFeedback.textContent=''; cloudflareFeedback.className=''; } }, 3000);
    } catch(err) { cloudflareFeedback.textContent = 'Error: '+err.message; cloudflareFeedback.className = 'error'; }
    finally { saveCloudflareBtn.disabled = false; }
});

function renderProjectsList() {
    projectsList.innerHTML = '';
    if (!allProjects.length) { projectsList.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">No projects registered.</div>'; return; }
    allProjects.forEach(function(project) {
        var item = document.createElement('div'); item.className = 'project-item';
        item.innerHTML = '<div class="project-item-name">'+project.name+'</div><div class="project-item-path">'+project.path+'</div>';
        var del = document.createElement('button'); del.className = 'project-item-del'; del.textContent = '✕'; del.title = 'Remove';
        del.addEventListener('click', async function() {
            try {
                await apiDelete('/api/projects/'+project.id);
                allProjects = allProjects.filter(function(p){ return p.id!==project.id; });
                renderProjectsList();
                renderProjectSelector();
                // If deleted project was active, switch to global
                if (activeProjectId === project.id) switchProject(null);
            }
            catch(err) { projectsFeedback.textContent = 'Error: '+err.message; projectsFeedback.className = 'error'; }
        });
        item.appendChild(del); projectsList.appendChild(item);
    });
}

addProjectBtn.addEventListener('click', async function() {
    var name = newProjectName.value.trim();
    if (!name) { projectsFeedback.textContent = 'Name is required.'; projectsFeedback.className = 'error'; return; }
    try {
        var data = await apiPost('/api/projects', { name: name });
        allProjects.push(data.project); newProjectName.value = '';
        projectsFeedback.textContent = 'Project added.'; projectsFeedback.className = 'success';
        renderProjectsList();
        renderProjectSelector();
    } catch(err) { projectsFeedback.textContent = 'Error: '+err.message; projectsFeedback.className = 'error'; }
});

resetBtn.addEventListener('click', async function() {
    if (!confirm('This will delete ALL projects, chats, and agents (except Swarmito). This cannot be undone. Continue?')) return;
    resetBtn.disabled = true;
    resetFeedback.textContent = ''; resetFeedback.className = '';
    try {
        var r = await fetch('/api/reset', { method: 'POST' });
        var d = await r.json();
        if (!d.ok) throw new Error(d.error || 'Reset failed');
        // Clear local state — INIT_STATE broadcast will repopulate
        allChats = []; allProjects = []; activeChatId = null; activeProjectId = null;
        renderChatList();
        renderProjectSelector();
        emptyState.style.display = '';
        activeChatEl.style.display = 'none';
        infoContent.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">No chat selected.</div>';
        settingsOverlay.classList.remove('visible');
    } catch(err) {
        resetFeedback.textContent = 'Error: ' + err.message;
        resetFeedback.className = 'error';
    } finally {
        resetBtn.disabled = false;
    }
});

function renderAgentList(agents) {
    agentListEl.innerHTML = '';
    if (!agents || !agents.length) { agentListEl.innerHTML = '<li style="color:var(--text-muted);font-size:12px;">No agents found.</li>'; return; }
    agents.forEach(function(agent) {
        var li = document.createElement('li');
        var color = agentColor(agent.id);
        li.innerHTML = '<div style="font-weight:600;font-size:12px;color:'+color+'">'+agent.name+' <span style="font-weight:normal;color:var(--text-muted);font-family:var(--font-mono);font-size:10px;">('+agent.id+')</span></div>'+(agent.description?'<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">'+agent.description+'</div>':'');
        agentListEl.appendChild(li);
    });
}

// ── Autocomplete ──────────────────────────────────────────────────────────────
function getAtQuery() {
    var val = inputEl.value, cursor = inputEl.selectionStart;
    var before = val.slice(0, cursor), match = before.match(/@([\w\-\/]*)$/);
    return match ? { query: match[1], start: cursor - match[0].length } : null;
}

function showAutocomplete(items, atStart) {
    autocompleteEl.innerHTML = ''; acActiveIndex = -1;
    if (!items.length) { hideAutocomplete(); return; }
    items.forEach(function(item) {
        var div = document.createElement('div'); div.className = 'autocomplete-item';
        var color = agentColor(item.id);
        div.innerHTML = '<span class="ac-id" style="color:'+color+'">@'+item.id+'</span>'+(item.description?'<span class="ac-desc">'+item.description+'</span>':'');
        div.addEventListener('mousedown', function(e) { e.preventDefault(); applyAutocomplete(item.id, atStart); });
        autocompleteEl.appendChild(div);
    });
    var rect = inputEl.getBoundingClientRect();
    autocompleteEl.style.display = 'block';
    autocompleteEl.style.left = rect.left + 'px';
    autocompleteEl.style.width = rect.width + 'px';
    var acH = Math.min(items.length * 52, 220);
    autocompleteEl.style.top = (rect.top - acH - 6) + 'px';
}

function hideAutocomplete() { autocompleteEl.style.display = 'none'; acActiveIndex = -1; }

function applyAutocomplete(agentId, atStart) {
    var val = inputEl.value, afterAt = val.slice(atStart + 1);
    var wordEnd = afterAt.search(/[^\w\-\/]/);
    var replaceEnd = atStart + 1 + (wordEnd === -1 ? afterAt.length : wordEnd);
    inputEl.value = val.slice(0, atStart) + '@' + agentId + val.slice(replaceEnd);
    var newCursor = atStart + 1 + agentId.length;
    inputEl.setSelectionRange(newCursor, newCursor);
    hideAutocomplete(); inputEl.focus();
}

function updateAutocomplete() {
    var q = getAtQuery(); if (!q) { hideAutocomplete(); return; }
    var query = q.query.toLowerCase();
    var candidates = [{ id: 'user', name: 'User', description: 'Return control to the user' }].concat(allAgents);
    var filtered = candidates.filter(function(a) { return a.id.toLowerCase().includes(query) || (a.name && a.name.toLowerCase().includes(query)); });
    showAutocomplete(filtered, q.start);
}

document.addEventListener('click', function(e) { if (!autocompleteEl.contains(e.target) && e.target !== inputEl) hideAutocomplete(); });

// ── WebSocket ─────────────────────────────────────────────────────────────────
var ws, wsTimer;

function connectWS() {
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(protocol + '//' + location.host);
    ws.addEventListener('open', function() { connStatus.classList.add('connected'); clearTimeout(wsTimer); });
    ws.addEventListener('close', function() { connStatus.classList.remove('connected'); wsTimer = setTimeout(connectWS, 3000); });
    ws.addEventListener('error', function() { connStatus.classList.remove('connected'); });
    ws.addEventListener('message', function(event) {
        var msg; try { msg = JSON.parse(event.data); } catch(e) { return; }
        handleServerEvent(msg.event, msg.payload);
    });
}

function handleServerEvent(event, payload) {
    switch (event) {
        case 'INIT_STATE':
            allChats = payload.chats || [];
            allProjects = payload.projects || [];
            renderProjectSelector();
            renderChatList();
            if (allChats.length > 0) {
                // Set activeChatId immediately so APPEND_MESSAGE events aren't dropped
                activeChatId = allChats[0].id;
                openChat(allChats[0].id);
            }
            break;

        case 'APPEND_MESSAGE':
            if (payload.chatId === activeChatId && payload.role && payload.content) {
                if (payload.role === 'assistant') hideThinking();
                appendMessage(payload.role, payload.content, payload.agentId);
            }
            // Update preview in sidebar
            var chatIdx = allChats.findIndex(function(c){ return c.id === payload.chatId; });
            if (chatIdx !== -1) {
                allChats[chatIdx].lastMessage = (payload.content||'').slice(0, 80);
                renderChatList();
            }
            break;

        case 'REPLACE_HISTORY':
            if (payload.chatId === activeChatId) {
                messagesEl.innerHTML = '';
                userMessageCount = 0;
                (payload.messages||[]).forEach(function(m) {
                    if ((m.role==='user'||m.role==='assistant') && m.content) appendMessage(m.role, m.content, m.agentId);
                });
            }
            break;

        case 'COST_UPDATED':
            if (payload.chatId === activeChatId) {
                chatCost.textContent = '$' + (payload.totalCostUsd||0).toFixed(4);
            }
            var ci = allChats.findIndex(function(c){ return c.id === payload.chatId; });
            if (ci !== -1) allChats[ci].totalCostUsd = payload.totalCostUsd;
            break;

        case 'AGENT_CHANGED':
            if (payload.chatId === activeChatId && payload.agentId) {
                agentSelect.value = payload.agentId;
            }
            break;

        case 'AGENT_STARTED':
            activeSwarmAgents[payload.chatId] = payload.agentId;
            if (payload.chatId === activeChatId) {
                showThinking(payload.agentId);
                var chat = allChats.find(function(c){ return c.id === payload.chatId; });
                if (chat) renderInfoPanel(chat);
            }
            break;

        case 'AGENT_FINISHED':
            if (activeSwarmAgents[payload.chatId] === payload.agentId) {
                delete activeSwarmAgents[payload.chatId];
            }
            if (payload.chatId === activeChatId) {
                hideThinking();
                var chat2 = allChats.find(function(c){ return c.id === payload.chatId; });
                if (chat2) renderInfoPanel(chat2);
            }
            break;

        case 'SWARM_IDLE':
            delete activeSwarmAgents[payload.chatId];
            if (payload.chatId === activeChatId) {
                hideThinking();
                var chat3 = allChats.find(function(c){ return c.id === payload.chatId; });
                if (chat3) renderInfoPanel(chat3);
            }
            break;

        case 'TOOL_CALL':
            if (payload.chatId === activeChatId) {
                var agentLabel = shortName(payload.agentId || 'assistant');
                var toolLabel = payload.toolName || 'tool';
                updateThinkingLabel(agentLabel + ' \u2192 ' + toolLabel + '\u2026');
            }
            break;

        case 'TOOL_RESULT':
            if (payload.chatId === activeChatId) {
                var agentLabel2 = shortName(payload.agentId || 'assistant');
                var status = payload.ok === false ? ' \u2717' : ' \u2713';
                updateThinkingLabel(agentLabel2 + ' \u2192 ' + (payload.toolName || 'tool') + status);
            }
            break;

        case 'SPENDING_LIMIT_REACHED':
            if (payload.chatId === activeChatId) {
                spendingBannerText.textContent = 'Spending limit reached at $' + (payload.totalCostUsd||0).toFixed(4) + '. Approve to continue.';
                spendingBanner.classList.add('visible');
            }
            break;

        case 'OPEN_CHAT':
            if (payload.chatId) {
                // If chat already in list, open immediately; otherwise defer until CHAT_CREATED
                var existsInList = allChats.some(function(c){ return c.id === payload.chatId; });
                if (existsInList) {
                    openChat(payload.chatId);
                } else {
                    _pendingOpenChatId = payload.chatId;
                }
            }
            break;

        case 'CHAT_CREATED':
            // Always track the chat in allChats so openChat() can find it
            if (!allChats.some(function(c){ return c.id === payload.id; })) {
                allChats.unshift(payload);
            }
            // Only render in sidebar if it belongs to the currently active project context
            if (payload.projectId === activeProjectId) {
                renderChatList();
            }
            if (_pendingOpenChatId && _pendingOpenChatId === payload.id) {
                var pendingId = _pendingOpenChatId;
                _pendingOpenChatId = null;
                openChat(pendingId);
            }
            break;

        case 'CHAT_DELETED':
            allChats = allChats.filter(function(c){ return c.id !== payload.chatId; });
            renderChatList();
            break;
    }
}

// ── Startup ───────────────────────────────────────────────────────────────────
async function startup() {
    connectWS();
    try {
        var agentsData = await apiChat('GET_AGENTS', {});
        allAgents = agentsData.agents || [];
        var settingsData = await apiChat('GET_SETTINGS', {});
        allProjects = (settingsData && settingsData.projects) || [];
    } catch(e) { /* will retry via WS */ }
}

startup();

}());