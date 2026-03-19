(async () => {
    // Ждём полной загрузки страницы
    await new Promise(resolve => {
        if (document.readyState === 'complete') return resolve();
        const check = setInterval(() => {
            if (document.readyState === 'complete') { clearInterval(check); resolve(); }
        }, 100);
        setTimeout(resolve, 8000);
    });

    // Пауза для JS-рендеринга результатов Google
    await new Promise(r => setTimeout(r, 2000));

    const results = [];
    const seen = new Set();

    // Стратегия 1: h3 внутри ссылок в #search (2025-2026 DOM)
    const searchBox = document.querySelector('#search') || document.querySelector('#rso') || document.body;
    const h3Links = searchBox.querySelectorAll('a:has(h3)');

    for (const a of h3Links) {
        const href = a.href;
        if (!href || !href.startsWith('http') || href.includes('google.') || seen.has(href)) continue;

        const h3 = a.querySelector('h3');
        if (!h3) continue;
        seen.add(href);

        let snippet = '';
        const parent = a.closest('[data-sokoban-container]') || a.closest('.g') || a.parentElement?.parentElement?.parentElement;
        if (parent) {
            const snipEl = parent.querySelector('[data-sncf="1"]') || parent.querySelector('.VwiC3b') || parent.querySelector('.st');
            if (snipEl) snippet = snipEl.textContent.trim();
        }

        results.push({
            url: href,
            title: h3.textContent.trim(),
            snippet: snippet.substring(0, 300),
            position: results.length + 1
        });
    }

    // Стратегия 2: fallback через .g блоки
    if (results.length === 0) {
        const gBlocks = document.querySelectorAll('.g, [data-hveid]');
        for (const block of gBlocks) {
            const link = block.querySelector('a[href^="http"]');
            const titleEl = block.querySelector('h3, .DKV0Md');
            if (link && titleEl) {
                const href = link.href;
                if (href.includes('google.') || seen.has(href)) continue;
                seen.add(href);
                results.push({
                    url: href,
                    title: titleEl.textContent.trim(),
                    snippet: '',
                    position: results.length + 1
                });
            }
        }
    }

    return JSON.stringify({
        success: true,
        query: document.querySelector('textarea[name="q"], input[name="q"]')?.value || '',
        totalResults: results.length,
        results: results.slice(0, 10),
        pageTitle: document.title
    });
})()