/**
 * Multi-Model AI Workbench - Complete Application Module
 * Consolidated, standalone ES6+ JavaScript with proper module structure
 */

/**
 * State Management & Local Persistence
 */
const State = {
    sessions: [],
    activeSessionId: null,

    init() {
        const saved = localStorage.getItem('ai_workbench_sessions');
        if (saved) {
            try {
                this.sessions = JSON.parse(saved);
            } catch (e) {
                this.sessions = [];
            }
        }
        
        if (this.sessions.length === 0) {
            this.createNewSession();
        } else {
            this.activeSessionId = this.sessions[0].id;
        }
    },

    save() {
        localStorage.setItem('ai_workbench_sessions', JSON.stringify(this.sessions));
    },

    createNewSession() {
        const newSession = {
            id: Date.now().toString(),
            title: 'New Conversation',
            messages: []
        };
        this.sessions.unshift(newSession);
        this.activeSessionId = newSession.id;
        this.save();
        return newSession;
    },

    getActiveSession() {
        return this.sessions.find(s => s.id === this.activeSessionId);
    },

    addMessage(role, content) {
        const session = this.getActiveSession();
        if (!session) return;
        
        session.messages.push({ role, content, timestamp: Date.now() });
        
        if (session.messages.length === 1 && role === 'user') {
            session.title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
        }
        
        this.save();
    }
};

/**
 * Pre-Flight Safety & Policy Validation
 */
const SafetyValidator = {
    restrictedPatterns: [
        /\b(csam|explicit abuse|malware generation|ransomware build|exploit payload)\b/i,
        /\b(bypass auth|ddos script|zero-day exploit|phishing kit)\b/i
    ],

    validate(prompt) {
        for (const pattern of this.restrictedPatterns) {
            if (pattern.test(prompt)) {
                return {
                    safe: false,
                    reason: "Request flag detected: Prompt contains prohibited or non-compliant content."
                };
            }
        }
        return { safe: true };
    }
};

/**
 * Context History Builder & Token Estimator
 */
const ContextManager = {
    estimateTokens(text) {
        if (!text) return 0;
        return Math.ceil(text.length / 4);
    },

    buildPayload(session, currentPrompt, maxTokens = 4000) {
        let accumulatedTokens = this.estimateTokens(currentPrompt);
        const history = [];

        for (let i = session.messages.length - 1; i >= 0; i--) {
            const msg = session.messages[i];
            const msgTokens = this.estimateTokens(msg.content);

            if (accumulatedTokens + msgTokens > maxTokens) {
                break;
            }

            accumulatedTokens += msgTokens;
            history.unshift(msg);
        }

        return { history, estimatedTokens: accumulatedTokens };
    }
};

/**
 * Unified API Dispatcher Engine
 */
const APIService = {
    async sendMessage({ provider, apiKey, prompt }) {
        if (!apiKey) {
            throw new Error('API Key is required to send requests.');
        }

        const validation = SafetyValidator.validate(prompt);
        if (!validation.safe) {
            throw new Error(validation.reason);
        }

        switch (provider) {
            case 'openai':
                return await this.fetchOpenAI(apiKey, prompt);
            case 'anthropic':
                return await this.fetchAnthropic(apiKey, prompt);
            case 'google':
                return await this.fetchGemini(apiKey, prompt);
            case 'higgsfield':
                return await this.fetchHiggsfield(apiKey, prompt);
            default:
                throw new Error('Unsupported API provider selected.');
        }
    },

    async fetchOpenAI(apiKey, prompt) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }]
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || 'Failed to query OpenAI API.');
        }

        const data = await response.json();
        return data.choices[0].message.content;
    },

    async fetchOpenAIWithContext(apiKey, session, prompt) {
        const { history } = ContextManager.buildPayload(session, prompt);
        
        const messages = history.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
        }));
        messages.push({ role: 'user', content: prompt });

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: messages
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || 'Failed to query OpenAI API.');
        }

        const data = await response.json();
        return data.choices[0].message.content;
    },

    async fetchAnthropic(apiKey, prompt) {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1024,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || 'Failed to query Anthropic API.');
        }

        const data = await response.json();
        return data.content[0].text;
    },

    async fetchAnthropicWithContext(apiKey, session, prompt) {
        const { history } = ContextManager.buildPayload(session, prompt);

        const messages = history.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
        }));
        messages.push({ role: 'user', content: prompt });

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1024,
                messages: messages
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || 'Failed to query Anthropic API.');
        }

        const data = await response.json();
        return data.content[0].text;
    },

    async fetchGemini(apiKey, prompt) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || 'Failed to query Google Gemini API.');
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    },

    async fetchHiggsfield(apiKey, prompt) {
        const submitResponse = await fetch('https://api.higgsfield.ai/higgsfield-ai/soul/v2/standard', {
            method: 'POST',
            headers: {
                'Authorization': `Key ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prompt, enhance_prompt: true })
        });

        if (!submitResponse.ok) {
            const err = await submitResponse.json().catch(() => ({}));
            throw new Error(err.error || err.message || 'Failed to submit request to Higgsfield AI.');
        }

        const data = await submitResponse.json();
        const requestId = data.request_id || data.id;

        if (!requestId) {
            throw new Error('Higgsfield API did not return a valid Request ID.');
        }

        return await this.pollHiggsfieldStatus(apiKey, requestId);
    },

    async pollHiggsfieldStatus(apiKey, requestId, maxAttempts = 30) {
        const statusUrl = `https://api.higgsfield.ai/v2/requests/status/${requestId}`;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 4000));

            const res = await fetch(statusUrl, {
                headers: { 'Authorization': `Key ${apiKey}` }
            });

            if (!res.ok) continue;

            const data = await res.json();
            const status = (data.status || '').toUpperCase();

            if (status === 'COMPLETED' || status === 'SUCCESS') {
                const mediaUrl = data.output?.media_url?.[0] || data.output?.url;
                if (mediaUrl) {
                    return `Generation Output:\n![Generated Output](${mediaUrl})\nDirect URL: ${mediaUrl}`;
                }
                return 'Generation complete, but no direct URL was returned.';
            }

            if (status === 'FAILED' || status === 'REJECTED') {
                throw new Error(`Higgsfield job ended with status: ${status}`);
            }
        }

        throw new Error('Higgsfield generation request timed out.');
    }
};

/**
 * Text Parsing & Markdown Rendering
 */
function escapeHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function parseMarkdown(text) {
    let sanitized = escapeHTML(text);

    // Formats Code Blocks
    sanitized = sanitized.replace(/```([a-zA-Z]*)\n([\s\S]*?)```/g, (match, lang, code) => {
        const languageLabel = lang ? lang.toUpperCase() : 'CODE';
        return `
            <div style="background: #11111b; border: 1px solid var(--border-color); border-radius: 6px; margin: 10px 0; overflow: hidden;">
                <div style="background: #181825; padding: 6px 12px; display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-code);">
                    <span>${languageLabel}</span>
                    <button onclick="navigator.clipboard.writeText(this.parentElement.nextElementSibling.innerText)" style="background: transparent; border: 1px solid var(--border-color); color: var(--accent); cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem;">Copy</button>
                </div>
                <pre style="padding: 12px; font-family: var(--font-code); font-size: 0.85rem; overflow-x: auto; color: var(--text-primary); margin: 0;"><code>${code.trim()}</code></pre>
            </div>
        `;
    });

    // Inline formatting
    sanitized = sanitized.replace(/`([^`\n]+)`/g, '<code style="background: var(--bg-surface); padding: 2px 6px; border-radius: 4px; font-family: var(--font-code); font-size: 0.85rem; color: #f5e0dc;">$1</code>');
    sanitized = sanitized.replace(/^### (.*$)/gim, '<h3 style="font-size: 1.1rem; font-weight: 700; margin-top: 12px; margin-bottom: 6px;">$1</h3>');
    sanitized = sanitized.replace(/^## (.*$)/gim, '<h2 style="font-size: 1.25rem; font-weight: 700; margin-top: 16px; margin-bottom: 8px;">$1</h2>');
    sanitized = sanitized.replace(/^# (.*$)/gim, '<h1 style="font-size: 1.4rem; font-weight: 800; margin-top: 18px; margin-bottom: 10px;">$1</h1>');

    return sanitized.replace(/\n/g, '<br>');
}

/**
 * Settings & Preferences Manager
 */
const SettingsManager = {
    STORAGE_KEY: 'ai_workbench_settings',

    defaults: {
        theme: 'dark',
        saveApiKeyLocally: false,
        lastProvider: 'openai'
    },

    load() {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (!saved) return { ...this.defaults };
        try {
            return { ...this.defaults, ...JSON.parse(saved) };
        } catch (e) {
            return { ...this.defaults };
        }
    },

    save(settings) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
    },

    saveApiKey(provider, key) {
        const settings = this.load();
        if (settings.saveApiKeyLocally && key) {
            localStorage.setItem(`ai_key_${provider}`, key);
        } else {
            localStorage.removeItem(`ai_key_${provider}`);
        }
    },

    getApiKey(provider) {
        return localStorage.getItem(`ai_key_${provider}`) || '';
    },

    clearAllData() {
        if (confirm('Are you sure you want to clear all chat histories and saved settings?')) {
            localStorage.clear();
            window.location.reload();
        }
    }
};

/**
 * UI State & Loading Notification Component
 */
const StatusNotifier = {
    showLoadingIndicator() {
        let loader = document.getElementById('statusLoader');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'statusLoader';
            loader.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px 16px;
                font-size: 0.85rem;
                color: var(--text-muted);
                font-style: italic;
            `;
            loader.innerHTML = `<span>AI is processing request...</span>`;
            document.getElementById('chatViewport').appendChild(loader);
        }
        UI.scrollToBottom();
    },

    removeLoadingIndicator() {
        const loader = document.getElementById('statusLoader');
        if (loader) {
            loader.remove();
        }
    }
};

/**
 * Data Export & Import Manager
 */
const ExportEngine = {
    exportToJson(session) {
        if (!session) return;
        const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
        this.triggerDownload(blob, `${session.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_chat.json`);
    },

    exportToMarkdown(session) {
        if (!session) return;
        let mdContent = `# ${session.title}\n\n`;
        session.messages.forEach(msg => {
            const role = msg.role === 'user' ? '**User**' : '**AI Assistant**';
            mdContent += `### ${role}\n${msg.content}\n\n---\n\n`;
        });

        const blob = new Blob([mdContent], { type: 'text/markdown' });
        this.triggerDownload(blob, `${session.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_chat.md`);
    },

    triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};

/**
 * Real-Time Streaming Engine
 */
const StreamEngine = {
    async streamOpenAI(apiKey, session, prompt, onChunk) {
        const { history } = ContextManager.buildPayload(session, prompt);
        const messages = history.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
        }));
        messages.push({ role: 'user', content: prompt });

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: messages,
                stream: true
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || 'Failed to initialize OpenAI stream.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.replace(/^data: /, '').trim();
                    if (dataStr === '[DONE]') return fullText;

                    try {
                        const parsed = JSON.parse(dataStr);
                        const delta = parsed.choices?.[0]?.delta?.content || '';
                        fullText += delta;
                        onChunk(fullText);
                    } catch (e) {
                        // Ignore parse errors on partial chunk boundaries
                    }
                }
            }
        }
        return fullText;
    }
};

/**
 * Interface & Rendering Controller
 */
const UI = {
    init() {
        this.cacheDOM();
        this.bindEvents();
        this.initSettings();
        this.renderHistory();
        this.renderViewport();
    },

    cacheDOM() {
        this.newChatBtn = document.getElementById('newChatBtn');
        this.historyList = document.getElementById('historyList');
        this.chatViewport = document.getElementById('chatViewport');
        this.promptInput = document.getElementById('promptInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.providerSelect = document.getElementById('providerSelect');
        this.apiKeyInput = document.getElementById('apiKeyInput');
    },

    bindEvents() {
        this.newChatBtn.addEventListener('click', () => {
            State.createNewSession();
            this.renderHistory();
            this.renderViewport();
        });

        this.sendBtn.addEventListener('click', () => this.handleSend());

        this.promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });

        this.promptInput.addEventListener('input', () => {
            this.promptInput.style.height = 'auto';
            this.promptInput.style.height = `${this.promptInput.scrollHeight}px`;
        });
    },

    initSettings() {
        const settings = SettingsManager.load();

        if (this.providerSelect) {
            this.providerSelect.value = settings.lastProvider;
            this.apiKeyInput.value = SettingsManager.getApiKey(settings.lastProvider);

            this.providerSelect.addEventListener('change', (e) => {
                const selectedProvider = e.target.value;
                const currentSettings = SettingsManager.load();
                currentSettings.lastProvider = selectedProvider;
                SettingsManager.save(currentSettings);

                this.apiKeyInput.value = SettingsManager.getApiKey(selectedProvider);
            });
        }

        if (this.apiKeyInput) {
            this.apiKeyInput.addEventListener('change', (e) => {
                const provider = this.providerSelect.value;
                SettingsManager.saveApiKey(provider, e.target.value.trim());
            });
        }
    },

    renderHistory() {
        this.historyList.innerHTML = '';
        State.sessions.forEach(session => {
            const item = document.createElement('div');
            item.className = `history-item ${session.id === State.activeSessionId ? 'active' : ''}`;
            item.textContent = session.title;
            item.addEventListener('click', () => {
                State.activeSessionId = session.id;
                this.renderHistory();
                this.renderViewport();
            });
            this.historyList.appendChild(item);
        });
    },

    renderViewport() {
        this.chatViewport.innerHTML = '';
        const session = State.getActiveSession();
        if (!session) return;

        session.messages.forEach(msg => {
            this.appendMessageCard(msg.role, msg.content);
        });
        this.scrollToBottom();
    },

    appendMessageCard(role, content) {
        const card = document.createElement('div');
        card.className = `message-card ${role}`;

        const avatar = document.createElement('div');
        avatar.className = `avatar ${role}`;
        avatar.textContent = role === 'user' ? 'U' : 'AI';

        const body = document.createElement('div');
        body.className = 'message-content';
        body.innerHTML = parseMarkdown(content);

        card.appendChild(avatar);
        card.appendChild(body);
        this.chatViewport.appendChild(card);
        this.scrollToBottom();
    },

    async handleSend() {
        const prompt = this.promptInput.value.trim();
        const apiKey = this.apiKeyInput.value.trim();
        const provider = this.providerSelect.value;

        if (!prompt) return;

        if (!apiKey) {
            State.addMessage('user', prompt);
            this.appendMessageCard('user', prompt);
            this.promptInput.value = '';
            this.promptInput.style.height = 'auto';
            
            const notice = '[System Notice] Please enter a valid API key in the configuration sidebar to transmit requests.';
            State.addMessage('assistant', notice);
            this.appendMessageCard('assistant', notice);
            return;
        }

        State.addMessage('user', prompt);
        this.appendMessageCard('user', prompt);
        this.renderHistory();

        this.promptInput.value = '';
        this.promptInput.style.height = 'auto';

        StatusNotifier.showLoadingIndicator();

        try {
            let aiResponse = '';
            const session = State.getActiveSession();

            // Use context-aware multi-turn routing
            if (provider === 'openai') {
                aiResponse = await APIService.fetchOpenAIWithContext(apiKey, session, prompt);
            } else if (provider === 'anthropic') {
                aiResponse = await APIService.fetchAnthropicWithContext(apiKey, session, prompt);
            } else {
                aiResponse = await APIService.sendMessage({ provider, apiKey, prompt });
            }

            StatusNotifier.removeLoadingIndicator();
            State.addMessage('assistant', aiResponse);
            this.appendMessageCard('assistant', aiResponse);
        } catch (error) {
            StatusNotifier.removeLoadingIndicator();
            const errorMsg = `[Error] ${error.message}`;
            State.addMessage('assistant', errorMsg);
            this.appendMessageCard('assistant', errorMsg);
        }
    },

    scrollToBottom() {
        this.chatViewport.scrollTop = this.chatViewport.scrollHeight;
    }
};

/**
 * Application Initialization
 * Triggers on DOMContentLoaded event
 */
document.addEventListener('DOMContentLoaded', () => {
    State.init();
    UI.init();
});
