/* Full viewport captures from the real application, with fictional demo data. */
(() => {
  const explorer = document.querySelector('[data-capability-explorer]');
  const tabs = [...(explorer?.querySelectorAll('[data-capability-tab]') || [])];
  function activate(tab) {
    tabs.forEach(button => {
      const selected = button === tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      document.getElementById(button.getAttribute('aria-controls')).hidden = !selected;
    });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowDown') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowUp') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) {
        event.preventDefault();
        activate(tabs[next]);
        tabs[next].focus({ preventScroll: true });
      }
    });
  });
  const dialog = document.getElementById('feature-screen-dialog');
  if (!dialog) return;
  let trigger;
  const close = dialog.querySelector('[data-feature-close]');
  document.querySelectorAll('[data-feature-screen]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      trigger = link;
      const image = link.querySelector('img');
      const expanded = dialog.querySelector('img');
      expanded.src = link.href;
      expanded.alt = image.alt;
      dialog.querySelector('[data-feature-title]').textContent = link.dataset.featureTitle;
      dialog.showModal();
      document.body.classList.add('actual-ai-scroll-locked');
      close.focus({ preventScroll: true });
    });
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    document.body.classList.remove('actual-ai-scroll-locked');
    trigger?.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
})();
