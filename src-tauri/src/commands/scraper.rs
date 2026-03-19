//! SERP Scraper — полный research через скрытый WebView
//!
//! Создаёт невидимый WebView2 (Chromium), выполняет серию поисковых запросов
//! в Google (конкуренты, статистики, госисточники, эксперты, FAQ),
//! фетчит и очищает HTML каждой страницы, сохраняет файлы.
//!
//! 5 групп запросов → ~30 страниц → knowledge проекта.
//! Claude получает реальные данные вместо web search.

use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use std::fs;
use tauri::{AppHandle, Emitter, Manager, WebviewBuilder, WebviewUrl, LogicalPosition, LogicalSize};
use serde::{Deserialize, Serialize};

// ─── Константы ───────────────────────────────────────────────────────────

const SCRAPER_LABEL: &str = "scraper";

/// JS скрипт для извлечения органических результатов из Google SERP
const SERP_EXTRACT_JS: &str = include_str!("../../scripts/serp_extract.js");

/// Мьютекс для предотвращения параллельных операций скрапинга
static SCRAPER_LOCK: std::sync::LazyLock<Mutex<()>> = std::sync::LazyLock::new(|| Mutex::new(()));

/// Флаг: страница загружена (из on_page_load)
static PAGE_LOADED: AtomicBool = AtomicBool::new(false);


// ─── Типы ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct SerpResult {
    pub url: String,
    pub title: String,
    pub snippet: String,
    pub position: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrapeProgress {
    pub stage: String,     // "init", "serp", "fetching", "done", "error"
    pub current: u32,
    pub total: u32,
    pub url: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScrapeResultData {
    pub keyword: String,
    pub geo: String,
    pub serp_results: Vec<SerpResult>,
    pub page_files: Vec<String>,
}


// ─── Команды ─────────────────────────────────────────────────────────────

/// Создаёт скрытый scraper WebView (offscreen)
#[tauri::command]
pub async fn create_scraper_webview(app: AppHandle) -> Result<(), String> {
    let _guard = SCRAPER_LOCK.lock().map_err(|_| "Scraper lock poisoned")?;

    if app.get_webview(SCRAPER_LABEL).is_some() {
        return Ok(());
    }

    let window = app.get_window("main").ok_or("Window not found")?;

    window.add_child(
        WebviewBuilder::new(SCRAPER_LABEL, WebviewUrl::External("about:blank".parse().unwrap()))
            .on_page_load(move |_webview, payload| {
                use tauri::webview::PageLoadEvent;
                if payload.event() == PageLoadEvent::Finished {
                    PAGE_LOADED.store(true, Ordering::SeqCst);
                }
            }),
        LogicalPosition::new(-9999.0, -9999.0),
        LogicalSize::new(1280.0, 900.0),
    ).map_err(|e| format!("Failed to create scraper webview: {}", e))?;

    Ok(())
}

/// Уничтожает scraper WebView
#[tauri::command]
pub async fn destroy_scraper_webview(app: AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview(SCRAPER_LABEL) {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Группа поисковых запросов (передаётся из frontend)
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SearchQuery {
    suffix: String,
    prefix: String,
    num: u32,
}

/// Парсит Google SERP по серии запросов, фетчит HTML, сохраняет файлы.
/// Запросы настраиваются через конструктор в UI и передаются как JSON.
/// Дедупликация URL между группами.
#[tauri::command]
pub async fn scrape_google_serp(
    app: AppHandle,
    keyword: String,
    geo: Option<String>,
    num_results: Option<u32>,
    lang: Option<String>,
    queries: Option<String>,
) -> Result<String, String> {
    let geo = geo.unwrap_or_else(|| "us".to_string());
    let _num = num_results.unwrap_or(10).min(10);
    let lang = lang.unwrap_or_else(|| "en".to_string());

    // Парсим запросы из JSON; если пусто — скрапим просто по ключу
    let mut search_queries: Vec<SearchQuery> = queries
        .and_then(|q| serde_json::from_str(&q).ok())
        .unwrap_or_default();

    if search_queries.is_empty() {
        search_queries.push(SearchQuery { suffix: String::new(), prefix: "serp".into(), num: 10 });
    }

    // Общее количество страниц для прогресса
    let total_pages: u32 = search_queries.iter().map(|g| g.num).sum();

    let _ = app.emit("scraper-progress", ScrapeProgress {
        stage: "init".into(), current: 0, total: total_pages,
        url: String::new(),
        message: format!("Research: {}", keyword),
    });

    create_scraper_webview(app.clone()).await?;

    let downloads_dir = crate::downloads::paths::get_custom_downloads_path()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            dirs::download_dir().unwrap_or_else(|| std::path::PathBuf::from("."))
        });

    let mut all_serp_results: Vec<SerpResult> = Vec::new();
    let mut all_page_files: Vec<String> = Vec::new();
    let mut seen_urls: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut fetched_count: u32 = 0;

    for group in &search_queries {
        let query = format!("{}{}", keyword, group.suffix);
        let query_encoded = urlencoding::encode(&query);
        let google_url = format!(
            "https://www.google.com/search?q={}&num={}&hl={}&gl={}",
            query_encoded, group.num + 5, lang, geo  // запрашиваем чуть больше на случай дедупа
        );

        let _ = app.emit("scraper-progress", ScrapeProgress {
            stage: "serp".into(),
            current: fetched_count, total: total_pages,
            url: String::new(),
            message: format!("Searching: {} ...", if group.suffix.is_empty() { &keyword } else { group.suffix.trim() }),
        });

        // Google SERP
        if let Err(e) = navigate_and_wait(&app, &google_url, 10).await {
            eprintln!("[scraper] SERP failed for '{}': {}", query, e);
            continue;
        }

        let serp_json = match cdp_eval(&app, SERP_EXTRACT_JS, 15).await {
            Ok(json) => json,
            Err(e) => { eprintln!("[scraper] SERP extract failed: {}", e); continue; }
        };

        let serp_data: serde_json::Value = match serde_json::from_str(&serp_json) {
            Ok(v) => v,
            Err(e) => { eprintln!("[scraper] SERP parse failed: {}", e); continue; }
        };

        let results: Vec<SerpResult> = serp_data.get("results")
            .and_then(|r| serde_json::from_value(r.clone()).ok())
            .unwrap_or_default();

        // Фетчим страницы (с дедупликацией)
        let mut urls_to_fetch: Vec<(String, String)> = Vec::new(); // (url, filename)
        let mut group_idx = 0u32;
        for result in &results {
            if group_idx >= group.num { break; }
            if seen_urls.contains(&result.url) { continue; }
            seen_urls.insert(result.url.clone());
            group_idx += 1;
            let filename = format!("{}-{:02}-{}.txt", group.prefix, group_idx, sanitize_domain(&result.url));
            urls_to_fetch.push((result.url.clone(), filename));
        }

        for (url, filename) in &urls_to_fetch {
            fetched_count += 1;
            let _ = app.emit("scraper-progress", ScrapeProgress {
                stage: "fetching".into(),
                current: fetched_count, total: total_pages,
                url: url.clone(),
                message: format!("[{}/{}] {}", fetched_count, total_pages, sanitize_domain(url)),
            });

            match fetch_page_html(&app, url).await {
                Ok(html) => {
                    let filepath = downloads_dir.join(filename);
                    if fs::write(&filepath, &html).is_ok() {
                        all_page_files.push(filepath.to_string_lossy().to_string());
                    }
                }
                Err(e) => {
                    eprintln!("[scraper] Fetch failed {}: {}", url, e);
                }
            }
        }

        // Сохраняем SERP результаты первой группы
        if all_serp_results.is_empty() {
            all_serp_results = results;
        }

        // Пауза между группами (Google rate limiting)
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }

    if all_page_files.is_empty() {
        return Err("No pages fetched. Possible captcha or network error.".into());
    }

    let _ = app.emit("scraper-progress", ScrapeProgress {
        stage: "done".into(),
        current: total_pages, total: total_pages,
        url: String::new(),
        message: format!("Done! {} pages saved", all_page_files.len()),
    });

    let result = ScrapeResultData {
        keyword: keyword.clone(),
        geo: geo.clone(),
        serp_results: all_serp_results,
        page_files: all_page_files,
    };

    serde_json::to_string(&result)
        .map_err(|e| format!("Failed to serialize result: {}", e))
}


// ─── Вспомогательные ─────────────────────────────────────────────────────

/// Навигация + ожидание загрузки
async fn navigate_and_wait(app: &AppHandle, url: &str, timeout_secs: u64) -> Result<(), String> {
    let webview = app.get_webview(SCRAPER_LABEL)
        .ok_or("Scraper webview not found")?;

    PAGE_LOADED.store(false, Ordering::SeqCst);

    let url_parsed = url.parse()
        .map_err(|e| format!("Invalid URL '{}': {}", url, e))?;
    webview.navigate(url_parsed).map_err(|e| e.to_string())?;

    let start = std::time::Instant::now();
    loop {
        if PAGE_LOADED.load(Ordering::SeqCst) { break; }
        if start.elapsed().as_secs() > timeout_secs {
            return Err(format!("Page load timeout after {}s: {}", timeout_secs, url));
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    // Пауза для рендеринга контента
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    Ok(())
}

/// Навигация на URL → возвращает текстовый контент страницы
async fn fetch_page_html(app: &AppHandle, url: &str) -> Result<String, String> {
    navigate_and_wait(app, url, 15).await?;
    // Берём только текст — никакой разметки, скриптов, стилей
    cdp_eval(app, "document.body.innerText", 10).await
}

/// CDP eval в scraper webview
async fn cdp_eval(app: &AppHandle, script: &str, timeout_secs: u64) -> Result<String, String> {
    let webview = app.get_webview(SCRAPER_LABEL)
        .ok_or("Scraper webview not found")?;

    #[cfg(windows)]
    {
        use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2;

        let result: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
        let result_clone = Arc::clone(&result);
        let done: Arc<Mutex<bool>> = Arc::new(Mutex::new(false));
        let done_clone = Arc::clone(&done);

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
            "Runtime.evaluate".encode_utf16().chain(std::iter::once(0)).collect()
        );
        let params_wide: Arc<Vec<u16>> = Arc::new(
            cdp_params.encode_utf16().chain(std::iter::once(0)).collect()
        );

        let _method_ref = Arc::clone(&method_wide);
        let _params_ref = Arc::clone(&params_wide);

        let _ = webview.with_webview(move |wv| {
            let _keep_method = &_method_ref;
            let _keep_params = &_params_ref;

            unsafe {
                let core: ICoreWebView2 = wv.controller().CoreWebView2().unwrap();

                let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                    move |hr: windows::core::Result<()>, json_result: String| {
                        if hr.is_ok() && !json_result.is_empty() {
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json_result) {
                                if let Some(value) = parsed.get("result").and_then(|r| r.get("value")) {
                                    let mut r = result_clone.lock().unwrap_or_else(|e| e.into_inner());
                                    if let Some(s) = value.as_str() {
                                        *r = Some(s.to_string());
                                    } else {
                                        *r = Some(value.to_string());
                                    }
                                } else if let Some(err) = parsed.get("exceptionDetails") {
                                    let mut r = result_clone.lock().unwrap_or_else(|e| e.into_inner());
                                    *r = Some(format!("{{\"error\":{}}}", err));
                                }
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

        let start = std::time::Instant::now();
        loop {
            {
                let d = done.lock().unwrap_or_else(|e| e.into_inner());
                if *d { break; }
            }
            if start.elapsed().as_secs() > timeout_secs {
                return Err(format!("CDP eval timeout after {}s", timeout_secs));
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }

        let r = result.lock().unwrap_or_else(|e| e.into_inner());
        Ok(r.clone().unwrap_or_else(|| "null".to_string()))
    }

    #[cfg(not(windows))]
    {
        let _ = (webview, timeout_secs);
        Err("Scraper is only supported on Windows (WebView2)".into())
    }
}

/// URL → sanitized domain for filename
///
/// "https://www.bestcasinos.com.au/online-slots" → "bestcasinos-com-au-online-slots"
fn sanitize_domain(url: &str) -> String {
    let without_scheme = url
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_start_matches("www.");

    let sanitized: String = without_scheme
        .chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' => c,
            '.' | '/' | '_' => '-',
            _ => '-',
        })
        .collect::<String>()
        .to_lowercase();

    // Убираем дублирующиеся дефисы и trailing
    let collapsed: String = sanitized
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<&str>>()
        .join("-");

    // Truncate
    if collapsed.len() > 70 {
        collapsed[..70].trim_end_matches('-').to_string()
    } else {
        collapsed
    }
}
