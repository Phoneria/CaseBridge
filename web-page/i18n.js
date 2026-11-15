/* The marketing website is English-only, including legacy language links. */
(() => {
  document.documentElement.lang = 'en';
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) {
    url.searchParams.delete('lang');
    history.replaceState(history.state, '', url);
  }
})();
