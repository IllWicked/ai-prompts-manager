// claude_autocontinue.js — Auto-Continue v1.0 for APM
// Adapted from claude-autocontinue (MIT) for WebView2 injection.
// No monkey-patching, no execCommand, no extension APIs.
// Uses button.click() — same as APM's sendButton click in claude.rs.
// Toast via Tauri emit → Main WebView showToast().

(function() {
    'use strict';
    if (window._ac) return;

    var LIMIT_PHRASES = [
        'tool-use limit',
        'tool use limit',
        'reached its tool',
        'exhausted the tool',
        'tool call limit',
        'continuation needed'
    ];

    var MSG_SELECTORS = [
        '[data-testid="assistant-message"]',
        '.font-claude-message',
        '[class*="AssistantMessage"]',
        '[class*="assistant-message"]'
    ];

    // ── State ──────────────────────────────────────────────────────────
    window._ac = {
        enabled: false,
        _timer: null,
        _pending: false
    };

    // ── Detection ──────────────────────────────────────────────────────

    function detectToolUseLimit() {
        // Gate 1: visible Continue button
        var continueBtn = null;
        var allBtns = document.querySelectorAll('button, [role="button"]');
        for (var i = 0; i < allBtns.length; i++) {
            var el = allBtns[i];
            var t = (el.innerText || el.textContent || '').trim();
            if ((t === 'Continue' || t.indexOf('Continue') === 0) && el.offsetParent !== null) {
                continueBtn = el;
                break;
            }
        }
        if (!continueBtn) return null;

        // Gate 2: phrase in last assistant message only
        var searchEl = null;
        for (var j = 0; j < MSG_SELECTORS.length; j++) {
            var all = document.querySelectorAll(MSG_SELECTORS[j]);
            if (all.length) {
                searchEl = all[all.length - 1];
                break;
            }
        }

        var searchText = searchEl
            ? (searchEl.innerText || searchEl.textContent || '').toLowerCase()
            : (document.body && document.body.innerText || '').slice(-2000).toLowerCase();

        for (var k = 0; k < LIMIT_PHRASES.length; k++) {
            if (searchText.indexOf(LIMIT_PHRASES[k]) !== -1) {
                return continueBtn;
            }
        }
        return null;
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    function randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function emitToast(message) {
        if (window._emit) {
            try { window._emit('auto-continue-toast', message); } catch(e) {}
        }
    }

    // ── Poll loop ──────────────────────────────────────────────────────

    function poll() {
        if (!window._ac.enabled || window._ac._pending) return;

        var btn = detectToolUseLimit();
        if (!btn) return;

        window._ac._pending = true;

        var clickDelay = randomInt(1500, 3000);
        setTimeout(function() {
            if (!window._ac.enabled) {
                window._ac._pending = false;
                return;
            }
            var freshBtn = detectToolUseLimit();
            if (freshBtn) {
                freshBtn.click();
                emitToast('Auto-continue \u2022 Chat ' + (window._t || '?'));
            }
            window._ac._pending = false;
        }, clickDelay);
    }

    function startPoll() {
        stopPoll();
        function tick() {
            poll();
            window._ac._timer = setTimeout(tick, randomInt(2000, 4000));
        }
        window._ac._timer = setTimeout(tick, randomInt(1000, 2000));
    }

    function stopPoll() {
        if (window._ac._timer) {
            clearTimeout(window._ac._timer);
            window._ac._timer = null;
        }
        window._ac._pending = false;
    }

    // ── Enable/Disable API ─────────────────────────────────────────────

    window._ac.setEnabled = function(val) {
        window._ac.enabled = !!val;
        if (window._ac.enabled) {
            startPoll();
        } else {
            stopPoll();
        }
    };

    // Pending-flag: если Main WebView уже прислал команду включения ДО того как
    // этот IIFE успел выполниться (race c claude-page-loaded), подхватываем её
    if (window._acWantEnabled === true) {
        window._ac.setEnabled(true);
    }

})();
