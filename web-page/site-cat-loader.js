// Loads the CaseBridge site cat after the page has finished loading (idle time),
// so it never competes with the page itself. Configuration comes from this tag:
// data-api (chat endpoint). On localhost, ?site-cat-api=<url> overrides it for local checks.
(function () {
  var tag = document.currentScript;
  if (!tag || window.__casebridgeSiteCat) return;
  var base = tag.src.replace(/site-cat-loader\.js.*$/, '');
  var api = tag.getAttribute('data-api') || '';
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (local) {
    try { api = new URLSearchParams(location.search).get('site-cat-api') || 'http://127.0.0.1:8000/public/site-chat'; } catch (e) {}
  }
  window.__casebridgeSiteCat = {api: api, base: base};
  function load() {
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = base + 'site-cat.css?v=0.72';
    document.head.appendChild(css);
    var script = document.createElement('script');
    script.type = 'module';
    script.src = base + 'site-cat.js?v=0.72';
    document.body.appendChild(script);
  }
  function idle() { (window.requestIdleCallback || function (cb) { setTimeout(cb, 300); })(load, {timeout: 3000}); }
  if (document.readyState === 'complete') idle(); else window.addEventListener('load', idle);
})();
