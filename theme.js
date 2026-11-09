(() => {
    const root = document.documentElement;

    // apply the saved choice on every page
    const saved = localStorage.getItem('theme');
    if (saved) root.setAttribute('data-theme', saved);

    // only the page with the button (homepage) gets a click handler
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;

    btn.addEventListener('click', () => {
        const current = root.getAttribute('data-theme') ||
            (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        const next = current === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    });
})();