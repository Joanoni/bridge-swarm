# Bridge — AI Swarm Application

> **v1.3.0** · A standalone Node.js application that orchestrates multi-agent AI swarms powered by Anthropic Claude, with a real-time browser UI.

---

## What is Bridge?

Bridge lets you build and run **autonomous agent swarms**. A special meta-agent called **Swarmito** acts as the orchestrator: it creates agents, assembles teams, spins up project chats, and routes tasks between specialized agents. Agents hand off work to each other automatically via the `handoff_to_agent` tool until the task is complete or control is returned to the user.

---

## Architecture

| Module | Role |
|---|---|
| [`server.js`](server.js) | HTTP server (Express) + WebSocket server (ws). Exposes REST API and broadcasts real-time events to all connected browser clients. |
| [`core/engine.js`](core/engine.js) | Thin wrapper around the Anthropic Messages API. Handles the agentic loop (tool calls, `max_tokens` continuation, retries on 429/529), token counting, and cost calculation. |
| [`core/ai-chat.js`](core/ai-chat.js) | Chat session management. Persists history to disk (`history.json` + `raw.json`). Exposes a hook system (`before:message-sent`, `after:message-received`, `before:history-cleared`) used by the swarm layer. |
| [`core/ai-swarm.js`](core/ai-swarm.js) | Swarm routing layer. Hooks into `ai-chat` to inject the `handoff_to_agent` tool and drive the agent handoff loop after each turn. Handles cross-chat handoffs and consecutive self-turn limits. |
| [`core/swarmito.js`](core/swarmito.js) | Swarmito's meta-tools: CRUD for agents, teams, projects, and chats. These tools are only available to the `swarmito` agent. |
| [`core/ai-tools.js`](core/ai-tools.js) | Tool registry. Maps tool names to their implementations and binds agent context (allowed paths, workspace root). |
| [`core/settings.js`](core/settings.js) | Reads/writes `app-settings.json` (API keys, model, spending limit) and `projects.json`. |
| [`public/`](public/) | Single-page application (HTML/CSS/JS). Communicates with the server via REST and WebSocket. |

---

## Key Concepts

### Swarmito
The built-in orchestrator agent (`agents/swarmito/`). Always present in every chat. Has access to meta-tools for managing the swarm itself (create agents, start chats, etc.) plus the `handoff_to_agent` tool.

### Agents
Each agent lives in a directory (`agents/<id>/` for global agents, `projects/<projectId>/agents/<id>/` for project-scoped agents) containing:
- **`agent.json`** — metadata: `name`, `description`, `tools` (list of tool names), `allowedPaths`, `systemPromptFiles`
- **`system.md`** — the agent's system prompt (or multiple files listed in `systemPromptFiles`)

### Teams
Named groups of agents stored in `teams/<id>/team.json` (global) or `projects/<projectId>/teams/<id>/team.json` (project-scoped). Used by Swarmito to assemble chats.

### Projects
Isolated workspaces under `projects/<uuid>/`. Each project has its own `agents/`, `teams/`, `chats/`, and `src/` directories. Registered in `projects.json`.

### Handoff Tool
Every agent receives the `handoff_to_agent` tool. When an agent calls it with `next_agent: "<agentId>"`, the swarm layer automatically runs the next agent's turn without user intervention. Calling `next_agent: "user"` returns control to the human. An agent may hand off to itself up to 3 consecutive times before the swarm forces a return to the user.

### Tool Permissions
Agents only receive the tools listed in their `agent.json` `tools` array. File-system tools are further restricted to the paths listed in `allowedPaths` (resolved relative to the project's workspace root).

---

## Available Agent Tools

| Tool name | Description |
|---|---|
| `read_file` | Read a file from the filesystem |
| `write_file` | Write (create or overwrite) a file |
| `edit_file` | Apply targeted search/replace edits to an existing file |
| `list_directory` | List files and directories |
| `run_terminal_command` | Execute a shell command (PowerShell on Windows) |
| `web_search` | Search the web via Tavily API |
| `deploy_cloudflare` | Deploy a static site to Cloudflare Pages |

---

## Prerequisites

- **Node.js** ≥ 18
- **Anthropic API key** (required) — [console.anthropic.com](https://console.anthropic.com)
- **Tavily API key** (optional, required for `web_search`) — [tavily.com](https://tavily.com)

---

## Installation

```bash
npm install
```

---

## Running

```bash
# Default port 3000
npm start

# Custom port
node server.js --port 8080
```

Open `http://localhost:3000` in your browser.

---

## Configuration

Settings are stored in [`app-settings.json`](app-settings.json) at the project root and can be edited through the browser UI (Settings panel).

| Field | Default | Description |
|---|---|---|
| `provider` | `"anthropic"` | AI provider (currently only Anthropic) |
| `model` | `"claude-sonnet-4-6"` | Model ID |
| `apiKey` | `""` | Anthropic API key |
| `tavilyApiKey` | `""` | Tavily API key (for web search) |
| `spendingLimit` | `0` | Per-checkpoint USD limit (0 = disabled). When the cumulative cost crosses a multiple of this value, the swarm pauses and waits for user approval before continuing. |

### Available Models

| Model ID | Name |
|---|---|
| `claude-sonnet-4-6` | Claude Sonnet 4.6 |
| `claude-3-5-sonnet-20241022` | Claude 3.5 Sonnet |
| `claude-3-opus-20240229` | Claude 3 Opus |
| `claude-3-haiku-20240307` | Claude 3 Haiku |

---

## Directory Structure

```
bridge-swarm/
├── server.js               # Entry point
├── package.json
├── app-settings.json       # Runtime settings (API keys, model)
├── projects.json           # Registered projects list
│
├── core/
│   ├── engine.js           # Anthropic API loop
│   ├── ai-chat.js          # Chat sessions + hook system
│   ├── ai-swarm.js         # Swarm routing + handoff loop
│   ├── swarmito.js         # Swarmito meta-tools
│   ├── ai-tools.js         # Tool registry
│   └── settings.js         # Settings + projects persistence
│
├── agents/
│   └── swarmito/           # Built-in orchestrator agent
│       ├── agent.json
│       └── system.md
│
├── teams/                  # Global teams
├── chats/                  # Global chat histories
│   └── <chatId>/
│       ├── history.json    # Display-safe history
│       └── raw.json        # Full history with tool calls
│
├── projects/               # Project workspaces
│   └── <projectId>/
│       ├── project.json
│       ├── agents/
│       ├── teams/
│       ├── chats/
│       └── src/
│
├── tools/                  # Agent tool implementations
│   ├── read-file/
│   ├── write-file/
│   ├── edit-file/
│   ├── list-directory/
│   ├── run-terminal-command/
│   ├── web-search/
│   └── deploy-cloudflare/
│
└── public/                 # Browser SPA
    ├── index.html
    ├── styles.css
    └── app.js
```

---

## REST API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/chat` | Main command endpoint. Body: `{ command, payload }`. See [Chat Commands](#chat-commands) below. |
| `GET` | `/api/projects` | List all projects |
| `POST` | `/api/projects` | Create a project. Body: `{ name }` |
| `DELETE` | `/api/projects/:id` | Delete a project |
| `GET` | `/api/chats` | List chats. Query: `?projectId=<id>` (project chats), `?projectId=` (global chats), no param (all) |
| `POST` | `/api/reset` | Wipe all projects, chats, and non-swarmito agents; restore default state |

---

## Chat Commands

Send `POST /api/chat` with body `{ "command": "<COMMAND>", "payload": { ... } }`.

| Command | Payload | Description |
|---|---|---|
| `SEND_MESSAGE` | `{ chatId, content }` | Send a user message and trigger the agent turn |
| `CREATE_CHAT` | `{ name, agents[], projectId? }` | Create a new chat session |
| `DELETE_CHAT` | `{ chatId }` | Delete a chat |
| `GET_HISTORY` | `{ chatId }` | Get full message history |
| `GET_AGENTS` | `{ projectId? }` | List available agents |
| `SET_AGENT` | `{ chatId, agentId }` | Set the active agent for a chat |
| `CLEAR_HISTORY` | `{ chatId }` | Clear chat history and reset cost |
| `EDIT_MESSAGE` | `{ chatId, messageIndex, newContent }` | Edit a past user message and re-run from that point |
| `RESUME_TURN` | `{ chatId }` | Resume a turn paused by the spending limit |
| `GET_SETTINGS` | — | Get current settings (API key masked) |
| `GET_SETTINGS_WITH_KEY` | — | Get current settings including API keys |
| `SAVE_SETTINGS` | `{ provider?, model?, apiKey?, tavilyApiKey?, spendingLimit? }` | Save settings |

---

## WebSocket Events

The server broadcasts JSON messages `{ event, payload }` to all connected clients.

| Event | Payload | Description |
|---|---|---|
| `INIT_STATE` | `{ chats, projects }` | Sent on connection and after reset |
| `APPEND_MESSAGE` | `{ chatId, role, content, agentId? }` | New message to append to the chat |
| `REPLACE_HISTORY` | `{ chatId, messages[] }` | Replace the entire displayed history |
| `AGENT_STARTED` | `{ chatId, agentId }` | An agent began its turn |
| `AGENT_FINISHED` | `{ chatId, agentId }` | An agent completed its turn |
| `SWARM_IDLE` | `{ chatId }` | Swarm returned control to the user |
| `TOOL_CALL` | `{ chatId, agentId, toolName, input }` | Agent is calling a tool |
| `TOOL_RESULT` | `{ chatId, agentId, toolName, ok, ms }` | Tool call completed |
| `COST_UPDATED` | `{ chatId, totalCostUsd }` | Cumulative cost updated |
| `SPENDING_LIMIT_REACHED` | `{ chatId, totalCostUsd }` | Swarm paused — awaiting `RESUME_TURN` |
| `CHAT_CREATED` | chat object | A new chat was created |
| `CHAT_DELETED` | `{ chatId }` | A chat was deleted |
| `OPEN_CHAT` | `{ chatId }` | Frontend should navigate to this chat |
| `AGENT_CHANGED` | `{ chatId, agentId }` | Active agent changed |
| `LOG` | `{ message }` | Server log message |

---

## Swarmito Meta-Tools

These tools are exclusively available to the `swarmito` agent and allow it to manage the swarm at runtime.

| Tool | Description |
|---|---|
| `create_agent` | Create one or more agents (global or project-scoped) |
| `update_agent` | Update agent metadata or system prompt |
| `delete_agent` | Delete one or more agents |
| `copy_agent` | Copy an agent between scopes or projects |
| `create_team` | Create a named group of agents |
| `update_team` | Update a team's members or metadata |
| `delete_team` | Delete a team |
| `copy_team` | Copy a team between scopes |
| `create_project` | Create a new project workspace |
| `start_chat` | Create a new chat and optionally inject a briefing message to kick off the first agent |

---

## Spending Limit

When `spendingLimit` is set to a value greater than `0` (e.g. `1.00`), the swarm pauses every time the cumulative cost for a chat crosses a multiple of that value. The browser UI receives a `SPENDING_LIMIT_REACHED` event and can prompt the user to approve continuation. Sending `RESUME_TURN` resumes the paused turn.

---

## License

MIT
