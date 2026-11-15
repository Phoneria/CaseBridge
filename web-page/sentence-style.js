/* Apply the site's punctuation style to asynchronously rendered copy as well. */
(() => {
  const excluded = 'script,style,code,pre,textarea,[contenteditable]';
  const attributes = ['aria-label', 'alt', 'title'];
  // Internal dots in decimal numbers, domains, email addresses and versions stay intact.
  const clean = text => text.replace(/\.(?=\s|$|[”’"')\]])/g, '');
  // English copy drops sentence-final dots by design; Turkish keeps normal punctuation.
  const english = () => document.documentElement.lang !== 'tr';
  function text(node) {
    if (!english()) return;
    if (node.parentElement?.closest(excluded)) return;
    const value = clean(node.nodeValue);
    if (value !== node.nodeValue) node.nodeValue = value;
  }
  function labels(element) {
    if (!english()) return;
    if (element.closest(excluded)) return;
    for (const name of attributes) {
      const value = element.getAttribute(name);
      if (value !== null && clean(value) !== value) element.setAttribute(name, clean(value));
    }
  }
  function scan(root) {
    if (root.nodeType === Node.TEXT_NODE) { text(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE || root.closest(excluded)) return;
    labels(root);
    root.querySelectorAll('[aria-label],[alt],[title]').forEach(labels);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) text(walker.currentNode);
  }
  scan(document.body);
  new MutationObserver(changes => {
    for (const change of changes) {
      if (change.type === 'characterData') text(change.target);
      else if (change.type === 'attributes') labels(change.target);
      else change.addedNodes.forEach(scan);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: attributes });
})();
