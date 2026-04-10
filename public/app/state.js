// app/state.js — App namespace init + all shared state vars + DOM refs
var App = window.App = window.App || {};

// ── DOM helper ────────────────────────────────────────────────────────────────
App.$ = function(id) { return document.getElementById(id); };

// ── DOM refs ──────────────────────────────────────────────────────────────────
App.chatList         = App.$('chat-list');
App.newChatBtn       = App.$('new-chat-btn');
App.settingsBtn      = App.$('settings-btn');
App.emptyState       = App.$('empty-state');
App.activeChatEl     = App.$('active-chat');
App.chatTitle        = App.$('chat-title');
App.chatAgentsBadge  = App.$('chat-agents-badge');
App.chatCost         = App.$('chat-cost');
App.clearBtn         = App.$('clear-btn');
App.deleteChatBtn    = App.$('delete-chat-btn');
App.messagesEl       = App.$('messages');
App.spendingBanner   = App.$('spending-banner');
App.spendingBannerText = App.$('spending-banner-text');
App.continueBtn      = App.$('continue-btn');
App.agentSelect      = App.$('agent-select');
App.inputEl          = App.$('user-input');
App.sendBtn          = App.$('send-btn');
App.autocompleteEl   = App.$('autocomplete');
App.infoContent      = App.$('info-content');
App.globalCost       = App.$('global-cost');
App.connStatus       = App.$('conn-status');
App.projectSelectEl  = App.$('project-select');
App.sidebarEl        = App.$('sidebar');
App.sidebarToggle    = App.$('sidebar-toggle');
App.sidebarBackdrop  = App.$('sidebar-backdrop');

// File upload
App.attachBtn        = App.$('attach-btn');
App.fileInput        = App.$('file-input');
App.fileChips        = App.$('file-chips');
App.filesPanelEl     = App.$('files-panel');
App.filesPanelList   = App.$('files-panel-list');
App.filesPanelInput  = App.$('files-panel-input');

// New chat modal
App.newChatOverlay   = App.$('new-chat-overlay');
App.closeNewChat     = App.$('close-new-chat');
App.newChatName      = App.$('new-chat-name');
App.newChatProject   = App.$('new-chat-project');
App.newChatAgentsList = App.$('new-chat-agents-list');
App.createChatBtn    = App.$('create-chat-btn');
App.newChatFeedback  = App.$('new-chat-feedback');

// Settings modal
App.settingsOverlay      = App.$('settings-overlay');
App.closeSettings        = App.$('close-settings');
App.providerSelect       = App.$('provider-select');
App.modelSelect          = App.$('model-select');
App.apiKeyInput          = App.$('api-key-input');
App.spendingLimitInput   = App.$('spending-limit-input');
App.tavilyKeyInput       = App.$('tavily-key-input');
App.toggleTavilyKeyBtn   = App.$('toggle-tavily-key');
App.cfAccountIdInput     = App.$('cf-account-id-input');
App.toggleCfAccountIdBtn = App.$('toggle-cf-account-id');
App.cfApiTokenInput      = App.$('cf-api-token-input');
App.toggleCfApiTokenBtn  = App.$('toggle-cf-api-token');
App.toggleKeyBtn         = App.$('toggle-key');
App.saveSettingsBtn      = App.$('save-settings-btn');
App.settingsFeedback     = App.$('settings-feedback');
App.projectsList         = App.$('projects-list');
App.saveTavilyBtn        = App.$('save-tavily-btn');
App.tavilyFeedback       = App.$('tavily-feedback');
App.saveCloudflareBtn    = App.$('save-cloudflare-btn');
App.cloudflareFeedback   = App.$('cloudflare-feedback');
App.newProjectName       = App.$('new-project-name');
App.addProjectBtn        = App.$('add-project-btn');
App.projectsFeedback     = App.$('projects-feedback');
App.agentListEl          = App.$('agent-list');
App.resetBtn             = App.$('reset-btn');
App.resetFeedback        = App.$('reset-feedback');

// Export / Import
App.exportGlobalBtn      = App.$('export-global-btn');
App.exportProjectSelect  = App.$('export-project-select');
App.exportProjectBtn     = App.$('export-project-btn');
App.importBtn            = App.$('import-btn');
App.importFileInput      = App.$('import-file-input');
App.exportImportFeedback = App.$('export-import-feedback');

// ── State ─────────────────────────────────────────────────────────────────────
App.allChats           = [];
App.activeChatId       = null;
App.allAgents          = [];
App.allProjects        = [];
App.availableProviders = [];
App.activeSwarmAgents  = {};
App.isLoading          = false;
App.thinkingEl         = null;
App.acActiveIndex      = -1;
App._pendingOpenChatId = null;
App.activeProjectId    = null; // null = global
App.userMessageCount   = 0;   // tracks index of user messages for edit
