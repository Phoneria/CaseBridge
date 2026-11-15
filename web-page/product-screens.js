/* Direct screenshots of the product; switch image and full-size link together. */
(() => {
  function updateScreens() {
    const language = document.documentElement.lang === 'tr' ? 'tr' : 'en';
    document.querySelectorAll('img[data-product-screen-en]').forEach(image => {
      const source = image.getAttribute('data-product-screen-' + language);
      if (image.getAttribute('src') !== source) image.setAttribute('src', source);
      const link = image.closest('a');
      if (link && link.getAttribute('href') !== source) link.setAttribute('href', source);
    });
  }
  updateScreens();
  window.addEventListener('casebridge:languagechange', updateScreens);
})();
