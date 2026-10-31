const root = document.documentElement;
const saved = localStorage.getItem('theme');
if (saved) root.setAttribute('data-theme', saved);

document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const isDark = root.getAttribute('data-theme') === 'dark' ||
        (!root.hasAttribute('data-theme') &&
         matchMedia('(prefers-color-scheme: dark)').matches);
    const next = isDark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
});