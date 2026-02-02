//! Команды взаимодействия с Claude WebView
//!
//! Этот модуль содержит Tauri команды для:
//! - Управления табами Claude (переключение, открытие, закрытие)
//! - Навигации внутри Claude
//! - Выполнения JavaScript в Claude webview
//! - Вставки текста и отправки сообщений
//! - Мониторинга генерации

use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager};

use crate::state::{CLAUDE_VISIBLE, ACTIVE_TAB, PANEL_RATIO};
use crate::webview::scripts::get_generation_monitor_script;
use crate::webview::manager::{ensure_claude_webview, ensure_toolbar, resize_webviews};
use crate::utils::dimensions::animation::{ANIMATION_STEPS, ANIMATION_DELAY_MS};

/// Предзагружает Claude webview в фоне (без показа)
///
/// Ускоряет первую отправку промпта за счёт предварительной загрузки.
#[tauri::command]
pub async fn preload_claude(app: AppHandle) -> Result<(), String> {
    // Вызываем функцию из main.rs (пока она там)
    // После выноса в webview/manager.rs будет: webview::ensure_claude_webview(&app, 1, None)
    ensure_claude_webview(&app, 1, None)
}

/// Переключает видимость панели Claude
///
/// При открытии создаёт webview если не существует.
/// Анимирует изменение размера панели.
///
/// # Returns
/// Новое состояние видимости (true = показан)
#[tauri::command]
pub async fn toggle_claude(app: AppHandle) -> Result<bool, String> {
    let is_visible = CLAUDE_VISIBLE.load(Ordering::SeqCst);
    let new_state = !is_visible;
    
    if new_state {
        // Создаём первый таб если не существует
        ensure_claude_webview(&app, 1, None)?;
        // Создаём тулбар ПОСЛЕ claude чтобы он был поверх
        ensure_toolbar(&app)?;
    }
    
    // Анимация: плавное изменение размера за несколько шагов
    let ratio = PANEL_RATIO.load(Ordering::SeqCst) as f64 / 100.0;
    
    for i in 1..=ANIMATION_STEPS {
        let progress = i as f64 / ANIMATION_STEPS as f64;
        let eased = 1.0 - (1.0 - progress).powi(2); // ease-out quad
        
        let current_ratio = if new_state {
            // Открываем: от 100% до target ratio
            1.0 - (1.0 - ratio) * eased
        } else {
            // Закрываем: от target ratio до 100%
            ratio + (1.0 - ratio) * eased
        };
        
        // Временно устанавливаем ratio для анимации
        PANEL_RATIO.store((current_ratio * 100.0) as u32, Ordering::SeqCst);
        
        // Показываем Claude во время анимации открытия
        if new_state && i == 1 {
            CLAUDE_VISIBLE.store(true, Ordering::SeqCst);
        }
        
        resize_webviews(&app)?;
        std::thread::sleep(std::time::Duration::from_millis(ANIMATION_DELAY_MS));
    }
    
    // Финальное состояние
    PANEL_RATIO.store((ratio * 100.0) as u32, Ordering::SeqCst);
    CLAUDE_VISIBLE.store(new_state, Ordering::SeqCst);
    resize_webviews(&app)?;
    
    Ok(new_state)
}

/// Возвращает номер активного таба
#[tauri::command]
pub fn get_active_tab() -> u8 {
    ACTIVE_TAB.load(Ordering::SeqCst)
}

/// Переключает на указанный таб Claude
///
/// Все табы создаются при старте. Если таб ещё на about:blank — навигирует на claude.ai.
#[tauri::command]
pub async fn switch_claude_tab(app: AppHandle, tab: u8) -> Result<(), String> {
    if tab < 1 || tab > 3 {
        return Err("Invalid tab".to_string());
    }
    
    // Создаём тулбар если не существует
    ensure_toolbar(&app)?;
    
    let label = format!("claude_{}", tab);
    
    // Если таб существует и на about:blank — навигируем на claude.ai
    if let Some(webview) = app.get_webview(&label) {
        if let Ok(url) = webview.url() {
            if url.as_str() == "about:blank" {
                let claude_url = "https://claude.ai/new".parse()
                    .map_err(|e| format!("Invalid URL: {}", e))?;
                webview.navigate(claude_url).map_err(|e| e.to_string())?;
            }
        }
    }
    
    // Убеждаемся что Claude видим
    CLAUDE_VISIBLE.store(true, Ordering::SeqCst);
    ACTIVE_TAB.store(tab, Ordering::SeqCst);
    resize_webviews(&app)?;
    
    Ok(())
}

/// Переключает на указанный таб и навигирует на URL
#[tauri::command]
pub async fn switch_claude_tab_with_url(app: AppHandle, tab: u8, url: String) -> Result<(), String> {
    if tab < 1 || tab > 3 {
        return Err("Invalid tab".to_string());
    }
    
    // Создаём тулбар если не существует
    ensure_toolbar(&app)?;
    
    // Всегда создаём таб 1 если не существует
    ensure_claude_webview(&app, 1, None)?;
    
    let label = format!("claude_{}", tab);
    
    // Если webview уже существует - навигируем на URL
    if let Some(webview) = app.get_webview(&label) {
        let url_parsed = url.parse()
            .map_err(|e| format!("Invalid URL '{}': {}", url, e))?;
        webview.navigate(url_parsed).map_err(|e| e.to_string())?;
    } else if tab != 1 {
        // Создаём новый webview с URL
        ensure_claude_webview(&app, tab, Some(&url))?;
    }
    
    // Убеждаемся что Claude видим
    CLAUDE_VISIBLE.store(true, Ordering::SeqCst);
    ACTIVE_TAB.store(tab, Ordering::SeqCst);
    resize_webviews(&app)?;
    
    Ok(())
}

/// Получает URL активной страницы в табе
#[tauri::command]
pub async fn get_tab_url(app: AppHandle, tab: u8) -> Result<String, String> {
    let label = format!("claude_{}", tab);
    
    if let Some(webview) = app.get_webview(&label) {
        if let Ok(url) = webview.url() {
            let mut url_clean = url.clone();
            url_clean.set_fragment(None);
            return Ok(url_clean.to_string());
        }
    }
    Ok("https://claude.ai/new".to_string())
}

/// Возвращает состояние Claude (видимость, активный таб, существующие табы)
#[tauri::command]
pub async fn get_claude_state(app: AppHandle) -> Result<(bool, u8, Vec<u8>), String> {
    let is_visible = CLAUDE_VISIBLE.load(Ordering::SeqCst);
    let active_tab = ACTIVE_TAB.load(Ordering::SeqCst);
    
    // Какие табы существуют
    let mut existing_tabs = Vec::new();
    for i in 1u8..=3 {
        let label = format!("claude_{}", i);
        if app.get_webview(&label).is_some() {
            existing_tabs.push(i);
        }
    }
    
    Ok((is_visible, active_tab, existing_tabs))
}

/// Открывает новый чат в указанном табе
#[tauri::command]
pub async fn new_chat_in_tab(app: AppHandle, tab: u8) -> Result<(), String> {
    const CLAUDE_NEW_URL: &str = "https://claude.ai/new";
    let label = format!("claude_{}", tab);
    
    if let Some(webview) = app.get_webview(&label) {
        let url = CLAUDE_NEW_URL.parse()
            .map_err(|e| format!("Invalid URL: {}", e))?;
        webview.navigate(url).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Перезагружает страницу в указанном табе
#[tauri::command]
pub async fn reload_claude_tab(app: AppHandle, tab: u8) -> Result<(), String> {
    let label = format!("claude_{}", tab);
    if let Some(webview) = app.get_webview(&label) {
        webview.eval("location.reload()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Пересоздаёт webview таба полностью (для случаев когда webview завис)
#[tauri::command]
pub async fn recreate_claude_tab(app: AppHandle, tab: u8) -> Result<(), String> {
    let label = format!("claude_{}", tab);
    
    // Закрываем существующий webview
    if let Some(webview) = app.get_webview(&label) {
        let _ = webview.close();
    }
    
    // Ждём чтобы webview успел закрыться
    std::thread::sleep(std::time::Duration::from_millis(100));
    
    // Создаём заново
    ensure_claude_webview(&app, tab, None)?;
    
    // Если это активный таб — обновляем layout
    if ACTIVE_TAB.load(Ordering::SeqCst) == tab {
        resize_webviews(&app)?;
    }
    
    Ok(())
}

/// Навигирует на URL в указанном табе
#[tauri::command]
pub async fn navigate_claude_tab(app: AppHandle, tab: u8, url: String) -> Result<(), String> {
    let label = format!("claude_{}", tab);
    
    if let Some(webview) = app.get_webview(&label) {
        let parsed_url = url.parse()
            .map_err(|e| format!("Invalid URL '{}': {}", url, e))?;
        webview.navigate(parsed_url).map_err(|e| e.to_string())?;
        
        // Эмитим событие о начале навигации
        let _ = app.emit("claude-navigation-started", serde_json::json!({
            "tab": tab,
            "url": url
        }));
    }
    Ok(())
}

/// Уведомляет об изменении URL (для SPA навигации)
#[tauri::command]
pub async fn notify_url_change(app: AppHandle, tab: u8, url: String) -> Result<(), String> {
    let _ = app.emit("claude-url-changed", serde_json::json!({
        "tab": tab,
        "url": url
    }));
    Ok(())
}

/// Закрывает указанный таб Claude
///
/// Таб 1 нельзя закрыть — он базовый.
///
/// # Returns
/// Номер нового активного таба
#[tauri::command]
pub async fn close_claude_tab(app: AppHandle, tab: u8) -> Result<u8, String> {
    if tab == 1 {
        return Err("Cannot close tab 1".to_string());
    }
    
    let label = format!("claude_{}", tab);
    
    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|e| e.to_string())?;
    }
    
    // Определяем на какой таб переключиться
    let current_active = ACTIVE_TAB.load(Ordering::SeqCst);
    let new_active = if current_active == tab { 1 } else { current_active };
    
    ACTIVE_TAB.store(new_active, Ordering::SeqCst);
    resize_webviews(&app)?;
    
    Ok(new_active)
}

/// Сбрасывает состояние Claude (закрывает все webview)
#[tauri::command]
pub async fn reset_claude_state(app: AppHandle) -> Result<(), String> {
    // Закрываем все Claude webviews
    for i in 1u8..=3 {
        let label = format!("claude_{}", i);
        if let Some(webview) = app.get_webview(&label) {
            let _ = webview.close();
        }
    }
    
    // Закрываем toolbar и downloads
    if let Some(toolbar) = app.get_webview("toolbar") {
        let _ = toolbar.close();
    }
    if let Some(downloads) = app.get_webview("downloads") {
        let _ = downloads.close();
    }
    
    // Сбрасываем состояние
    CLAUDE_VISIBLE.store(false, Ordering::SeqCst);
    ACTIVE_TAB.store(1, Ordering::SeqCst);
    PANEL_RATIO.store(50, Ordering::SeqCst);
    
    // Ресайзим (UI на всю ширину)
    resize_webviews(&app)?;
    
    Ok(())
}

/// Устанавливает соотношение панелей
///
/// # Arguments
/// * `ratio` - процент ширины UI панели (35-65)
#[tauri::command]
pub async fn set_panel_ratio(app: AppHandle, ratio: u32) -> Result<(), String> {
    let clamped = ratio.clamp(35, 65);
    PANEL_RATIO.store(clamped, Ordering::SeqCst);
    resize_webviews(&app)?;
    Ok(())
}

/// Получает текущее соотношение панелей
#[tauri::command]
pub async fn get_panel_ratio() -> u32 {
    PANEL_RATIO.load(Ordering::SeqCst)
}

/// Выполняет JavaScript в Claude webview (без результата)
#[tauri::command]
pub async fn eval_in_claude(app: AppHandle, tab: u8, script: String) -> Result<(), String> {
    let label = format!("claude_{}", tab);
    if let Some(webview) = app.get_webview(&label) {
        webview.eval(&script).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Выполняет JavaScript в Claude webview и возвращает результат (только Windows)
///
/// Использует CDP Runtime.evaluate для поддержки async скриптов.
///
/// # Arguments
/// * `tab` - номер таба
/// * `script` - JavaScript код
/// * `timeout_secs` - таймаут в секундах (по умолчанию 10)
#[tauri::command]
pub async fn eval_in_claude_with_result(
    app: AppHandle, 
    tab: u8, 
    script: String, 
    timeout_secs: Option<u64>
) -> Result<String, String> {
    let label = format!("claude_{}", tab);
    let timeout = timeout_secs.unwrap_or(10);
    
    let webview = app.get_webview(&label)
        .ok_or_else(|| format!("Webview {} not found", label))?;
    
    #[cfg(windows)]
    {
        use std::sync::{Arc, Mutex};
        use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2;
        
        let result: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
        let result_clone = Arc::clone(&result);
        let done: Arc<Mutex<bool>> = Arc::new(Mutex::new(false));
        let done_clone = Arc::clone(&done);
        
        // Экранируем скрипт для JSON
        let escaped_script = script
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r")
            .replace('\t', "\\t")
            .replace('\u{2028}', "\\u2028")
            .replace('\u{2029}', "\\u2029")
            .replace('\0', "\\u0000");
        
        let cdp_params = format!(
            r#"{{"expression":"{}","awaitPromise":true,"returnByValue":true}}"#,
            escaped_script
        );
        
        let method_wide: Arc<Vec<u16>> = Arc::new(
            "Runtime.evaluate"
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect()
        );
        
        let params_wide: Arc<Vec<u16>> = Arc::new(
            cdp_params
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect()
        );
        
        let _method_wide_ref = Arc::clone(&method_wide);
        let _params_wide_ref = Arc::clone(&params_wide);
        
        let _ = webview.with_webview(move |wv| {
            let _keep_method = &_method_wide_ref;
            let _keep_params = &_params_wide_ref;
            
            unsafe {
                let core: ICoreWebView2 = wv.controller().CoreWebView2().unwrap();
                
                let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                    move |hr: windows::core::Result<()>, json_result: String| {
                        if hr.is_ok() && !json_result.is_empty() {
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json_result) {
                                if let Some(value) = parsed.get("result").and_then(|r| r.get("value")) {
                                    let mut r = result_clone.lock().unwrap_or_else(|e| e.into_inner());
                                    *r = Some(value.to_string());
                                } else if let Some(err) = parsed.get("exceptionDetails") {
                                    let mut r = result_clone.lock().unwrap_or_else(|e| e.into_inner());
                                    *r = Some(format!("{{\"error\":{}}}", err));
                                } else {
                                    let mut r = result_clone.lock().unwrap_or_else(|e| e.into_inner());
                                    *r = Some(json_result.clone());
                                }
                            } else {
                                let mut r = result_clone.lock().unwrap_or_else(|e| e.into_inner());
                                *r = Some(json_result.clone());
                            }
                        }
                        let mut d = done_clone.lock().unwrap_or_else(|e| e.into_inner());
                        *d = true;
                        Ok(())
                    }
                ));
                
                let method_pcwstr = windows_core::PCWSTR::from_raw(method_wide.as_ptr());
                let params_pcwstr = windows_core::PCWSTR::from_raw(params_wide.as_ptr());
                
                let _ = core.CallDevToolsProtocolMethod(method_pcwstr, params_pcwstr, &handler);
            }
        });
        
        // Ждём завершения с таймаутом
        let start = std::time::Instant::now();
        loop {
            {
                let d = done.lock().unwrap_or_else(|e| e.into_inner());
                if *d { break; }
            }
            if start.elapsed().as_secs() > timeout {
                return Err(format!("Timeout after {} seconds", timeout));
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        
        let r = result.lock().unwrap_or_else(|e| e.into_inner());
        Ok(r.clone().unwrap_or_else(|| "null".to_string()))
    }
    
    #[cfg(not(windows))]
    {
        let _ = (webview, timeout);
        Err("eval_in_claude_with_result is only supported on Windows".to_string())
    }
}

/// Инжектит монитор генерации в Claude webview
#[tauri::command]
pub async fn inject_generation_monitor(app: AppHandle, tab: u8) -> Result<(), String> {
    let label = format!("claude_{}", tab);
    if let Some(webview) = app.get_webview(&label) {
        let script = get_generation_monitor_script();
        webview.eval(&script).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Проверяет статус генерации по хешу URL
#[tauri::command]
pub async fn check_generation_status(app: AppHandle, tab: u8) -> Result<bool, String> {
    let label = format!("claude_{}", tab);
    if let Some(webview) = app.get_webview(&label) {
        if let Ok(url) = webview.url() {
            return Ok(url.to_string().contains("#generating"));
        }
    }
    Ok(false)
}

/// Вставляет текст в редактор Claude и опционально отправляет
///
/// # Arguments
/// * `tab` - номер таба
/// * `text` - текст для вставки
/// * `auto_send` - автоматически отправить после вставки
#[tauri::command]
pub async fn insert_text_to_claude(
    app: AppHandle, 
    tab: u8, 
    text: String, 
    auto_send: bool
) -> Result<(), String> {
    let label = format!("claude_{}", tab);
    
    let webview = app.get_webview(&label)
        .ok_or("Claude tab not found")?;
    
    // Экранируем текст для JS
    let escaped_text = text
        .replace("\\", "\\\\")
        .replace("`", "\\`")
        .replace("$", "\\$");
    
    let auto_send_js = if auto_send { "true" } else { "false" };
    
    let script = format!(r#"
        (function() {{
            const AUTO_SEND = {auto_send};
            const text = `{text}`;
            const SEL = window.__SEL__;
            
            // Ищем ProseMirror элемент
            const pmSelector = SEL?.input?.proseMirror || '.ProseMirror';
            const pmElement = document.querySelector(pmSelector);
            
            if (!pmElement) {{
                return false;
            }}
            
            const editor = pmElement.editor;
            
            if (editor && editor.commands && typeof editor.commands.insertContent === 'function') {{
                editor.commands.focus();
                editor.commands.clearContent();
                editor.commands.insertContent({{ type: 'text', text: text }});
            }} else if (editor && editor.editorView) {{
                const view = editor.editorView;
                const tr = view.state.tr;
                tr.delete(0, view.state.doc.content.size);
                tr.insertText(text, 0);
                view.dispatch(tr);
            }} else {{
                pmElement.focus();
                pmElement.innerHTML = '';
                const p = document.createElement('p');
                p.textContent = text;
                pmElement.appendChild(p);
                pmElement.dispatchEvent(new Event('input', {{ bubbles: true }}));
            }}
            
            if (AUTO_SEND) {{
                let attempts = 0;
                const maxAttempts = 50;
                let sent = false;
                const initialContent = pmElement.textContent?.trim() || '';
                
                const findBySelectors = (selectors) => {{
                    if (!selectors) return null;
                    const arr = Array.isArray(selectors) ? selectors : [selectors];
                    for (const sel of arr) {{
                        try {{
                            const el = document.querySelector(sel);
                            if (el) return el;
                        }} catch(e) {{}}
                    }}
                    return null;
                }};
                
                const tryToSend = () => {{
                    if (sent) return;
                    attempts++;
                    
                    const currentContent = pmElement.textContent?.trim() || '';
                    const stopBtn = findBySelectors(SEL?.generation?.stopButton);
                    const streamingEl = SEL?.generation?.streamingIndicator ? 
                        document.querySelector(SEL.generation.streamingIndicator) : null;
                    const isGenerating = !!(stopBtn || streamingEl);
                    
                    if ((initialContent && !currentContent) || isGenerating) {{
                        sent = true;
                        return;
                    }}
                    
                    let sendBtn = findBySelectors(SEL?.input?.sendButton);
                    
                    if (!sendBtn) {{
                        const fieldset = pmElement.closest('fieldset') || pmElement.closest('form') || pmElement.parentElement?.parentElement;
                        if (fieldset) {{
                            const btns = fieldset.querySelectorAll('button');
                            const attachPattern = SEL?.attachments?.attachButtonAriaPattern || 'attach';
                            for (const btn of btns) {{
                                const svg = btn.querySelector('svg');
                                const isAttachBtn = btn.getAttribute('aria-label')?.toLowerCase().includes(attachPattern);
                                if (svg && !btn.disabled && !isAttachBtn) {{
                                    const rect = btn.getBoundingClientRect();
                                    const pmRect = pmElement.getBoundingClientRect();
                                    if (rect.left > pmRect.left + pmRect.width / 2) {{
                                        sendBtn = btn;
                                    }}
                                }}
                            }}
                        }}
                    }}
                    
                    if (sendBtn && !sendBtn.disabled) {{
                        sendBtn.click();
                        sent = true;
                        setTimeout(() => {{
                            const stillHasContent = pmElement.textContent?.trim();
                            if (initialContent && stillHasContent && stillHasContent === initialContent) {{
                                sent = false;
                            }}
                        }}, 500);
                    }} else if (attempts < maxAttempts) {{
                        const delay = attempts < 10 ? 200 : 300;
                        setTimeout(tryToSend, delay);
                    }}
                }};
                
                setTimeout(tryToSend, 200);
            }}
            
            return true;
        }})();
    "#, auto_send = auto_send_js, text = escaped_text);
    
    webview.eval(&script).map_err(|e| e.to_string())?;
    Ok(())
}
