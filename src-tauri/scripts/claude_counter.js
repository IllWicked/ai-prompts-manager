/**
 * Claude Counter — rewritten for APM WebView2 injection
 * 
 * Original: Claude Counter extension v0.4.2 (MIT License)
 * Rewritten: No monkey-patching, no bridge pattern, direct fetch API
 * 
 * Shows ~token count, cache timer, and session/weekly usage bars.
 */
(() => {
	'use strict';

	if (window._cc0) return;
	window._cc0 = true;

	// ═══════════════════════════════════════════════════════════════
	// CONSTANTS
	// ═══════════════════════════════════════════════════════════════

	const CC_DOM = Object.freeze({
		CHAT_MENU_TRIGGER: '[data-testid="chat-menu-trigger"]',
		MODEL_SELECTOR_DROPDOWN: '[data-testid="model-selector-dropdown"]',
		CHAT_PROJECT_WRAPPER: '.chat-project-wrapper'
	});

	const CC_CONST = Object.freeze({
		CACHE_WINDOW_MS: 5 * 60 * 1000
	});

	const CC_COLORS = Object.freeze({
		PROGRESS_FILL_DARK: '#2c84db',
		PROGRESS_FILL_LIGHT: '#5aa6ff',
		PROGRESS_OUTLINE_DARK: '#787877',
		PROGRESS_OUTLINE_LIGHT: '#bfbfbf',
		PROGRESS_MARKER_DARK: '#ffffff',
		PROGRESS_MARKER_LIGHT: '#111111',
		RED_WARNING: '#ce2029',
		BOLD_LIGHT: '#141413',
		BOLD_DARK: '#faf9f5'
	});

	// ═══════════════════════════════════════════════════════════════
	// CONVERSATION MODULE
	// ═══════════════════════════════════════════════════════════════

	const ROOT_MESSAGE_ID = '00000000-0000-4000-8000-000000000000';

	function buildTrunk(conversation) {
		const messages = Array.isArray(conversation?.chat_messages) ? conversation.chat_messages : [];
		const byId = new Map();
		for (const msg of messages) {
			if (msg?.uuid) byId.set(msg.uuid, msg);
		}
		const leaf = conversation?.current_leaf_message_uuid;
		if (!leaf) return [];
		const trunk = [];
		let currentId = leaf;
		while (currentId && currentId !== ROOT_MESSAGE_ID) {
			const msg = byId.get(currentId);
			if (!msg) break;
			trunk.push(msg);
			currentId = msg.parent_message_uuid;
		}
		trunk.reverse();
		return trunk;
	}

	function computeConversationMetrics(conversation) {
		const trunk = buildTrunk(conversation);
		let lastAssistantMs = null;
		for (const msg of trunk) {
			if (msg?.sender === 'assistant' && msg?.created_at) {
				const msgMs = Date.parse(msg.created_at);
				if (!lastAssistantMs || msgMs > lastAssistantMs) lastAssistantMs = msgMs;
			}
		}
		const cachedUntil = lastAssistantMs ? lastAssistantMs + CC_CONST.CACHE_WINDOW_MS : null;
		return { trunkMessageCount: trunk.length, lastAssistantMs, cachedUntil };
	}

	// ═══════════════════════════════════════════════════════════════
	// UI MODULE
	// ═══════════════════════════════════════════════════════════════

	function formatSeconds(totalSeconds) {
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${String(seconds).padStart(2, '0')}`;
	}

	function formatResetCountdown(timestampMs) {
		const diffMs = timestampMs - Date.now();
		if (diffMs <= 0) return '0m';
		const totalMinutes = Math.round(diffMs / (1000 * 60));
		if (totalMinutes < 60) return `${totalMinutes}m`;
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;
		if (hours < 24) return `${hours}h ${minutes}m`;
		const days = Math.floor(hours / 24);
		const remHours = hours % 24;
		return `${days}d ${remHours}h`;
	}

	function waitForElement(selector, timeoutMs) {
		return new Promise((resolve) => {
			const existing = document.querySelector(selector);
			if (existing) { resolve(existing); return; }
			let timeoutId;
			const observer = new MutationObserver(() => {
				const el = document.querySelector(selector);
				if (el) {
					if (timeoutId) clearTimeout(timeoutId);
					observer.disconnect();
					resolve(el);
				}
			});
			observer.observe(document.body, { childList: true, subtree: true });
			if (timeoutMs) {
				timeoutId = setTimeout(() => { observer.disconnect(); resolve(null); }, timeoutMs);
			}
		});
	}

	function setupTooltip(element, tooltip, { topOffset = 10 } = {}) {
		if (!element || !tooltip) return;
		if (element.hasAttribute('data-tooltip-setup')) return;
		element.setAttribute('data-tooltip-setup', 'true');
		element.classList.add('cc-tooltipTrigger');

		let pressTimer, hideTimer;
		const show = () => {
			const rect = element.getBoundingClientRect();
			tooltip.style.opacity = '1';
			const tipRect = tooltip.getBoundingClientRect();
			let left = rect.left + rect.width / 2;
			if (left + tipRect.width / 2 > window.innerWidth) left = window.innerWidth - tipRect.width / 2 - 10;
			if (left - tipRect.width / 2 < 0) left = tipRect.width / 2 + 10;
			let top = rect.top - tipRect.height - topOffset;
			if (top < 10) top = rect.bottom + 10;
			tooltip.style.left = `${left}px`;
			tooltip.style.top = `${top}px`;
			tooltip.style.transform = 'translateX(-50%)';
		};
		const hide = () => { tooltip.style.opacity = '0'; clearTimeout(hideTimer); };

		element.addEventListener('pointerdown', (e) => {
			if (e.pointerType === 'touch' || e.pointerType === 'pen') {
				pressTimer = setTimeout(() => { show(); hideTimer = setTimeout(hide, 3000); }, 500);
			}
		});
		element.addEventListener('pointerup', () => clearTimeout(pressTimer));
		element.addEventListener('pointercancel', () => { clearTimeout(pressTimer); hide(); });
		element.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(); });
		element.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
	}

	function makeTooltip(text) {
		const tip = document.createElement('div');
		tip.className = 'bg-bg-500 text-text-000 cc-tooltip';
		tip.textContent = text;
		document.body.appendChild(tip);
		return tip;
	}

	class CounterUI {
		constructor({ onUsageRefresh } = {}) {
			this.onUsageRefresh = onUsageRefresh || null;
			this.headerContainer = null;
			this.headerDisplay = null;
			this.cachedDisplay = null;
			this.cacheTimeSpan = null;
			this.lastCachedUntilMs = null;
			this.pendingCache = false;
			this.usageLine = null;
			this.sessionUsageSpan = null;
			this.weeklyUsageSpan = null;
			this.sessionBar = null;
			this.sessionBarFill = null;
			this.weeklyBar = null;
			this.weeklyBarFill = null;
			this.sessionResetMs = null;
			this.weeklyResetMs = null;
			this.sessionMarker = null;
			this.weeklyMarker = null;
			this.sessionWindowStartMs = null;
			this.weeklyWindowStartMs = null;
			this.refreshingUsage = false;
			this.domObserver = null;
		}

		getProgressChrome() {
			const root = document.documentElement;
			const modeDark = root.dataset?.mode === 'dark';
			const modeLight = root.dataset?.mode === 'light';
			const isDark = modeDark && !modeLight;
			return {
				strokeColor: isDark ? CC_COLORS.PROGRESS_OUTLINE_DARK : CC_COLORS.PROGRESS_OUTLINE_LIGHT,
				fillColor: isDark ? CC_COLORS.PROGRESS_FILL_DARK : CC_COLORS.PROGRESS_FILL_LIGHT,
				markerColor: isDark ? CC_COLORS.PROGRESS_MARKER_DARK : CC_COLORS.PROGRESS_MARKER_LIGHT,
				boldColor: isDark ? CC_COLORS.BOLD_DARK : CC_COLORS.BOLD_LIGHT
			};
		}

		refreshProgressChrome() {
			const { strokeColor, fillColor, markerColor } = this.getProgressChrome();
			const applyBarChrome = (bar, { fillWarn } = {}) => {
				if (!bar) return;
				bar.style.setProperty('--cc-stroke', strokeColor);
				bar.style.setProperty('--cc-fill', fillColor);
				bar.style.setProperty('--cc-fill-warn', fillWarn ?? fillColor);
				bar.style.setProperty('--cc-marker', markerColor);
			};
			applyBarChrome(this.sessionBar, { fillWarn: CC_COLORS.RED_WARNING });
			applyBarChrome(this.weeklyBar, { fillWarn: CC_COLORS.RED_WARNING });
		}

		initialize() {
			this.headerContainer = document.createElement('div');
			this.headerContainer.className = 'text-text-500 text-xs !px-1 cc-header';
			this.headerDisplay = document.createElement('span');
			this.headerDisplay.className = 'cc-headerItem';
			this.cachedDisplay = document.createElement('span');
			this._initUsageLine();
			this._setupTooltips();
			this._observeDom();
			this._observeTheme();
		}

		_observeTheme() {
			const observer = new MutationObserver(() => this.refreshProgressChrome());
			observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });
		}

		_observeDom() {
			let usageReattachPending = false;
			let headerReattachPending = false;
			this.domObserver = new MutationObserver(() => {
				const usageMissing = this.usageLine && !document.contains(this.usageLine);
				const headerMissing = !document.contains(this.headerContainer);
				if (usageMissing && !usageReattachPending) {
					usageReattachPending = true;
					waitForElement(CC_DOM.MODEL_SELECTOR_DROPDOWN, 60000).then((el) => {
						usageReattachPending = false;
						if (el) this.attachUsageLine();
					});
				}
				if (headerMissing && !headerReattachPending) {
					headerReattachPending = true;
					waitForElement(CC_DOM.CHAT_MENU_TRIGGER, 60000).then((el) => {
						headerReattachPending = false;
						if (el) this.attachHeader();
					});
				}
			});
			this.domObserver.observe(document.body, { childList: true, subtree: true });
		}

		_initUsageLine() {
			this.usageLine = document.createElement('div');
			this.usageLine.className = 'text-text-400 text-[11px] cc-usageRow cc-hidden flex flex-row items-center gap-3 w-full';

			this.sessionUsageSpan = document.createElement('span');
			this.sessionUsageSpan.className = 'cc-usageText';
			this.sessionBar = document.createElement('div');
			this.sessionBar.className = 'cc-bar cc-bar--usage';
			this.sessionBarFill = document.createElement('div');
			this.sessionBarFill.className = 'cc-bar__fill';
			this.sessionMarker = document.createElement('div');
			this.sessionMarker.className = 'cc-bar__marker cc-hidden';
			this.sessionMarker.style.left = '0%';
			this.sessionBar.appendChild(this.sessionBarFill);
			this.sessionBar.appendChild(this.sessionMarker);

			this.weeklyUsageSpan = document.createElement('span');
			this.weeklyUsageSpan.className = 'cc-usageText';
			this.weeklyBar = document.createElement('div');
			this.weeklyBar.className = 'cc-bar cc-bar--usage';
			this.weeklyBarFill = document.createElement('div');
			this.weeklyBarFill.className = 'cc-bar__fill';
			this.weeklyMarker = document.createElement('div');
			this.weeklyMarker.className = 'cc-bar__marker cc-hidden';
			this.weeklyMarker.style.left = '0%';
			this.weeklyBar.appendChild(this.weeklyBarFill);
			this.weeklyBar.appendChild(this.weeklyMarker);

			this.sessionGroup = document.createElement('div');
			this.sessionGroup.className = 'cc-usageGroup';
			this.sessionGroup.appendChild(this.sessionUsageSpan);
			this.sessionGroup.appendChild(this.sessionBar);

			this.weeklyGroup = document.createElement('div');
			this.weeklyGroup.className = 'cc-usageGroup cc-usageGroup--weekly';
			this.weeklyGroup.appendChild(this.weeklyBar);
			this.weeklyGroup.appendChild(this.weeklyUsageSpan);

			this.usageLine.appendChild(this.sessionGroup);
			this.usageLine.appendChild(this.weeklyGroup);
			this.refreshProgressChrome();

			this.usageLine.addEventListener('click', async () => {
				if (!this.onUsageRefresh || this.refreshingUsage) return;
				this.refreshingUsage = true;
				this.usageLine.classList.add('cc-usageRow--dim');
				try { await this.onUsageRefresh(); }
				finally { this.usageLine.classList.remove('cc-usageRow--dim'); this.refreshingUsage = false; }
			});
		}

		_setupTooltips() {
			setupTooltip(this.cachedDisplay, makeTooltip("Messages sent while cached are significantly cheaper."), { topOffset: 8 });
			setupTooltip(this.sessionGroup, makeTooltip("5-hour session window.\nThe bar shows your usage.\nThe line marks where you are in the window."), { topOffset: 8 });
			setupTooltip(this.weeklyGroup, makeTooltip("7-day usage window.\nThe bar shows your usage.\nThe line marks where you are in the window."), { topOffset: 8 });
		}

		attachHeader() {
			const chatMenu = document.querySelector(CC_DOM.CHAT_MENU_TRIGGER);
			if (!chatMenu) return;
			const anchor = chatMenu.closest(CC_DOM.CHAT_PROJECT_WRAPPER) || chatMenu.parentElement;
			if (!anchor) return;
			if (anchor.nextElementSibling !== this.headerContainer) anchor.after(this.headerContainer);
			this._renderHeader();
			this.refreshProgressChrome();
		}

		attachUsageLine() {
			if (!this.usageLine) return;
			const modelSelector = document.querySelector(CC_DOM.MODEL_SELECTOR_DROPDOWN);
			if (!modelSelector) return;
			const gridContainer = modelSelector.closest('[data-testid="chat-input-grid-container"]');
			const gridArea = modelSelector.closest('[data-testid="chat-input-grid-area"]');
			const findToolbarRow = (el, stopAt) => {
				let cur = el;
				while (cur && cur !== document.body) {
					if (stopAt && cur === stopAt) break;
					if (cur !== el && cur.nodeType === 1) {
						const style = window.getComputedStyle(cur);
						if (style.display === 'flex' && style.flexDirection === 'row') {
							if (cur.querySelectorAll('button').length > 1) return cur;
						}
					}
					cur = cur.parentElement;
				}
				return null;
			};
			const toolbarRow = (gridContainer ? findToolbarRow(modelSelector, gridArea || gridContainer) : null)
				|| findToolbarRow(modelSelector) || modelSelector.parentElement?.parentElement?.parentElement;
			if (!toolbarRow) return;
			if (toolbarRow.nextElementSibling !== this.usageLine) toolbarRow.after(this.usageLine);
			this.refreshProgressChrome();
		}

		setPendingCache(pending) {
			this.pendingCache = pending;
			if (this.cacheTimeSpan) {
				if (pending) { this.cacheTimeSpan.style.color = ''; }
				else { this.cacheTimeSpan.style.color = this.getProgressChrome().boldColor; }
			}
		}

		setConversationMetrics({ cachedUntil } = {}) {
			this.pendingCache = false;
			const now = Date.now();
			if (typeof cachedUntil === 'number' && cachedUntil > now) {
				this.lastCachedUntilMs = cachedUntil;
				const secondsLeft = Math.max(0, Math.ceil((cachedUntil - now) / 1000));
				const { boldColor } = this.getProgressChrome();
				this.cacheTimeSpan = Object.assign(document.createElement('span'), { className: 'cc-cacheTime', textContent: formatSeconds(secondsLeft) });
				this.cacheTimeSpan.style.color = boldColor;
				this.cachedDisplay.replaceChildren(document.createTextNode('cached for\u00A0'), this.cacheTimeSpan);
			} else {
				this.lastCachedUntilMs = null;
				this.cacheTimeSpan = null;
				this.cachedDisplay.textContent = '';
			}
			this._renderHeader();
		}

		_renderHeader() {
			this.headerContainer.replaceChildren();
			const hasCache = !!this.cachedDisplay.textContent;
			if (!hasCache) return;
			this.headerDisplay.replaceChildren(this.cachedDisplay);
			this.headerContainer.appendChild(this.headerDisplay);
		}

		setUsage(usage) {
			this.refreshProgressChrome();
			const session = usage?.five_hour || null;
			const weekly = usage?.seven_day || null;
			const hasAnyUsage = !!(session && typeof session.utilization === 'number') || !!(weekly && typeof weekly.utilization === 'number');
			this.usageLine?.classList.toggle('cc-hidden', !hasAnyUsage);

			if (session && typeof session.utilization === 'number') {
				const rawPct = session.utilization;
				const pct = Math.round(rawPct * 10) / 10;
				this.sessionResetMs = session.resets_at ? Date.parse(session.resets_at) : null;
				this.sessionWindowStartMs = this.sessionResetMs ? this.sessionResetMs - 5 * 60 * 60 * 1000 : null;
				const resetText = this.sessionResetMs ? ` \u00B7 resets in ${formatResetCountdown(this.sessionResetMs)}` : '';
				this.sessionUsageSpan.textContent = `Session: ${pct}%${resetText}`;
				const width = Math.max(0, Math.min(100, rawPct));
				this.sessionBarFill.style.width = `${width}%`;
				this.sessionBarFill.classList.toggle('cc-warn', width >= 90);
				this.sessionBarFill.classList.toggle('cc-full', width >= 99.5);
			} else {
				this.sessionUsageSpan.textContent = '';
				this.sessionBarFill.style.width = '0%';
				this.sessionBarFill.classList.remove('cc-warn', 'cc-full');
				this.sessionResetMs = null;
				this.sessionWindowStartMs = null;
			}

			const hasWeekly = weekly && typeof weekly.utilization === 'number';
			this.weeklyGroup?.classList.toggle('cc-hidden', !hasWeekly);
			this.sessionGroup?.classList.toggle('cc-usageGroup--single', !hasWeekly);

			if (hasWeekly) {
				this.weeklyUsageSpan.classList.remove('cc-hidden');
				this.weeklyBar.classList.remove('cc-hidden');
				const rawPct = weekly.utilization;
				const pct = Math.round(rawPct * 10) / 10;
				this.weeklyResetMs = weekly.resets_at ? Date.parse(weekly.resets_at) : null;
				this.weeklyWindowStartMs = this.weeklyResetMs ? this.weeklyResetMs - 7 * 24 * 60 * 60 * 1000 : null;
				const resetText = this.weeklyResetMs ? ` \u00B7 resets in ${formatResetCountdown(this.weeklyResetMs)}` : '';
				this.weeklyUsageSpan.textContent = `Weekly: ${pct}%${resetText}`;
				const width = Math.max(0, Math.min(100, rawPct));
				this.weeklyBarFill.style.width = `${width}%`;
				this.weeklyBarFill.classList.toggle('cc-warn', width >= 90);
				this.weeklyBarFill.classList.toggle('cc-full', width >= 99.5);
			} else {
				this.weeklyUsageSpan.classList.add('cc-hidden');
				this.weeklyBar.classList.add('cc-hidden');
				this.weeklyResetMs = null;
				this.weeklyWindowStartMs = null;
				this.weeklyBarFill.classList.remove('cc-warn', 'cc-full');
			}
			this._updateMarkers();
		}

		_updateMarkers() {
			const now = Date.now();
			if (this.sessionMarker && this.sessionWindowStartMs && this.sessionResetMs) {
				const total = this.sessionResetMs - this.sessionWindowStartMs;
				const elapsed = Math.max(0, Math.min(total, now - this.sessionWindowStartMs));
				const pct = Math.max(0, Math.min(100, total > 0 ? (elapsed / total) * 100 : 0));
				this.sessionMarker.classList.remove('cc-hidden');
				this.sessionMarker.style.left = `${pct}%`;
			} else if (this.sessionMarker) { this.sessionMarker.classList.add('cc-hidden'); }

			if (this.weeklyMarker && this.weeklyWindowStartMs && this.weeklyResetMs) {
				const total = this.weeklyResetMs - this.weeklyWindowStartMs;
				const elapsed = Math.max(0, Math.min(total, now - this.weeklyWindowStartMs));
				const pct = Math.max(0, Math.min(100, total > 0 ? (elapsed / total) * 100 : 0));
				this.weeklyMarker.classList.remove('cc-hidden');
				this.weeklyMarker.style.left = `${pct}%`;
			} else if (this.weeklyMarker) { this.weeklyMarker.classList.add('cc-hidden'); }
		}

		tick() {
			const now = Date.now();
			if (this.lastCachedUntilMs && this.lastCachedUntilMs > now) {
				const secondsLeft = Math.max(0, Math.ceil((this.lastCachedUntilMs - now) / 1000));
				if (this.cacheTimeSpan) this.cacheTimeSpan.textContent = formatSeconds(secondsLeft);
			} else if (this.lastCachedUntilMs && this.lastCachedUntilMs <= now) {
				this.lastCachedUntilMs = null;
				this.cacheTimeSpan = null;
				this.pendingCache = false;
				this.cachedDisplay.textContent = '';
				this._renderHeader();
			}

			if (this.sessionResetMs && this.sessionUsageSpan?.textContent) {
				const idx = this.sessionUsageSpan.textContent.indexOf('\u00B7 resets in');
				if (idx !== -1) {
					const prefix = this.sessionUsageSpan.textContent.slice(0, idx + '\u00B7 resets in '.length);
					this.sessionUsageSpan.textContent = `${prefix}${formatResetCountdown(this.sessionResetMs)}`;
				}
			}
			if (this.weeklyResetMs && this.weeklyUsageSpan?.textContent) {
				const idx = this.weeklyUsageSpan.textContent.indexOf('\u00B7 resets in');
				if (idx !== -1) {
					const prefix = this.weeklyUsageSpan.textContent.slice(0, idx + '\u00B7 resets in '.length);
					this.weeklyUsageSpan.textContent = `${prefix}${formatResetCountdown(this.weeklyResetMs)}`;
				}
			}
			this._updateMarkers();
		}
	}

	// ═══════════════════════════════════════════════════════════════
	// MAIN MODULE (no bridge — direct fetch + APM mechanisms)
	// ═══════════════════════════════════════════════════════════════

	function getConversationId() {
		const match = window.location.pathname.match(/\/chat\/([^/?]+)/);
		return match ? match[1] : null;
	}

	function getOrgIdFromCookie() {
		try {
			return document.cookie.split('; ').find(row => row.startsWith('lastActiveOrg='))?.split('=')[1] || null;
		} catch { return null; }
	}

	function parseUsageFromUsageEndpoint(raw) {
		if (!raw || typeof raw !== 'object') return null;
		const normalizeWindow = (w, hours) => {
			if (!w || typeof w !== 'object') return null;
			if (typeof w.utilization !== 'number' || !Number.isFinite(w.utilization)) return null;
			const utilization = Math.max(0, Math.min(100, w.utilization));
			const resets_at = typeof w.resets_at === 'string' ? w.resets_at : null;
			return { utilization, resets_at, window_hours: hours };
		};
		const fiveHour = normalizeWindow(raw.five_hour, 5);
		const sevenDay = normalizeWindow(raw.seven_day, 24 * 7);
		if (!fiveHour && !sevenDay) return null;
		return { five_hour: fiveHour, seven_day: sevenDay };
	}

	let currentConversationId = null;
	let currentOrgId = null;
	let usageState = null;
	let usageResetMs = { five_hour: null, seven_day: null };
	let lastUsageUpdateMs = 0;
	let usageFetchInFlight = false;
	const rolloverHandledForResetMs = { five_hour: null, seven_day: null };

	// Track generation state for post-generation usage refresh
	let wasGenerating = false;

	const ui = new CounterUI({
		onUsageRefresh: async () => { await refreshUsage(); }
	});
	ui.initialize();

	function applyUsageUpdate(normalized, source) {
		if (!normalized) return;
		const now = Date.now();
		usageState = normalized;
		lastUsageUpdateMs = now;
		usageResetMs.five_hour = normalized.five_hour?.resets_at ? Date.parse(normalized.five_hour.resets_at) : null;
		usageResetMs.seven_day = normalized.seven_day?.resets_at ? Date.parse(normalized.seven_day.resets_at) : null;
		ui.setUsage(normalized);
	}

	function updateOrgIdIfNeeded(newOrgId) {
		if (newOrgId && typeof newOrgId === 'string' && newOrgId !== currentOrgId) {
			currentOrgId = newOrgId;
		}
	}

	// Direct fetch to Claude API (no bridge, no monkey-patching)
	async function refreshUsage() {
		const orgId = currentOrgId || getOrgIdFromCookie();
		if (!orgId) return;
		updateOrgIdIfNeeded(orgId);
		if (usageFetchInFlight) return;
		usageFetchInFlight = true;
		try {
			const res = await fetch(`/api/organizations/${orgId}/usage`, { method: 'GET', credentials: 'include' });
			const json = await res.json();
			const parsed = parseUsageFromUsageEndpoint(json);
			applyUsageUpdate(parsed, 'usage');
		} catch { /* ignore */ }
		finally { usageFetchInFlight = false; }
	}

	async function refreshConversation() {
		if (!currentConversationId) { ui.setConversationMetrics(); return; }
		const orgId = currentOrgId || getOrgIdFromCookie();
		if (!orgId) return;
		updateOrgIdIfNeeded(orgId);
		try {
			const url = `/api/organizations/${orgId}/chat_conversations/${currentConversationId}?tree=true&rendering_mode=messages&render_all_tools=true`;
			const res = await fetch(url, { method: 'GET', credentials: 'include' });
			const data = await res.json();
			if (data) {
				const metrics = computeConversationMetrics(data);
				ui.setConversationMetrics({ cachedUntil: metrics.cachedUntil });
			}
		} catch { /* ignore */ }
	}

	// URL change detection (no history monkey-patching — polling + popstate)
	function observeUrlChanges(callback) {
		let lastPath = window.location.pathname;
		const check = () => {
			const current = window.location.pathname;
			if (current !== lastPath) { lastPath = current; callback(); }
		};
		window.addEventListener('popstate', check);
		const interval = setInterval(check, 1500);
		return () => { window.removeEventListener('popstate', check); clearInterval(interval); };
	}

	async function handleUrlChange() {
		currentConversationId = getConversationId();

		waitForElement(CC_DOM.MODEL_SELECTOR_DROPDOWN, 60000).then(el => { if (el) ui.attachUsageLine(); });
		waitForElement(CC_DOM.CHAT_MENU_TRIGGER, 60000).then(el => { if (el) ui.attachHeader(); });

		if (!currentConversationId) { ui.setConversationMetrics(); return; }
		updateOrgIdIfNeeded(getOrgIdFromCookie());
		await refreshConversation();
		if (!usageState) await refreshUsage();
	}

	const unobserveUrl = observeUrlChanges(handleUrlChange);
	window.addEventListener('beforeunload', unobserveUrl);

	// Branch navigation refresh
	let branchObserver = null;
	document.addEventListener('click', (e) => {
		if (!currentConversationId) return;
		const btn = e.target.closest('button[aria-label="Previous"], button[aria-label="Next"]');
		if (!btn) return;
		const container = btn.closest('.inline-flex');
		const spans = container?.querySelectorAll('span') || [];
		const indicator = Array.from(spans).find(s => /^\d+\s*\/\s*\d+$/.test(s.textContent.trim()));
		if (!indicator) return;
		const originalText = indicator.textContent;
		if (branchObserver) branchObserver.disconnect();
		branchObserver = new MutationObserver(() => {
			if (indicator.textContent !== originalText) {
				branchObserver.disconnect();
				branchObserver = null;
				refreshConversation();
			}
		});
		branchObserver.observe(indicator, { childList: true, characterData: true, subtree: true });
		setTimeout(() => { if (branchObserver) { branchObserver.disconnect(); branchObserver = null; } }, 60000);
	});

	// Generation detection via APM URL hash mechanism
	function isGenerating() {
		return window.location.hash === '#generating';
	}

	// Initial attach
	handleUrlChange();

	// Main tick loop
	function tick() {
		ui.tick();

		// Detect generation end → refresh usage + conversation
		const generating = isGenerating();
		if (wasGenerating && !generating) {
			// Generation just ended — refresh data
			ui.setPendingCache(false);
			refreshUsage();
			refreshConversation();
		} else if (!wasGenerating && generating) {
			// Generation just started
			ui.setPendingCache(true);
		}
		wasGenerating = generating;

		// Rollover refresh
		const now = Date.now();
		if (usageResetMs.five_hour && now >= usageResetMs.five_hour && rolloverHandledForResetMs.five_hour !== usageResetMs.five_hour) {
			rolloverHandledForResetMs.five_hour = usageResetMs.five_hour;
			refreshUsage();
		}
		if (usageResetMs.seven_day && now >= usageResetMs.seven_day && rolloverHandledForResetMs.seven_day !== usageResetMs.seven_day) {
			rolloverHandledForResetMs.seven_day = usageResetMs.seven_day;
			refreshUsage();
		}

		// Hourly safety refresh
		const ONE_HOUR_MS = 60 * 60 * 1000;
		if (!document.hidden && (now - lastUsageUpdateMs) > ONE_HOUR_MS) {
			refreshUsage();
		}
	}

	setInterval(tick, 1000);
})();
