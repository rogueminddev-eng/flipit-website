// Apply a locally remembered theme before the first paint.
(function () {
  try {
    var theme = localStorage.getItem('flipit-theme');
    if (theme === 'dark' || theme === 'light') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  } catch (error) {}
})();
