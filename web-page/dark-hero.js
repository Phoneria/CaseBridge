/* User-supplied silent hero video; respect motion and data-saving preferences. */
(() => {
  const header = document.querySelector('.header');
  const syncHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 40);
  window.addEventListener('scroll', syncHeader, { passive: true });
  syncHeader();
  const video = document.querySelector('.hero-film');
  if (!video) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let inView = true;
  const sync = () => {
    if (motion.matches || navigator.connection?.saveData || document.hidden || !inView) {
      video.pause(); return;
    }
    video.play().catch(() => {});
  };
  document.addEventListener('visibilitychange', sync);
  motion.addEventListener('change', sync);
  const observer = new IntersectionObserver(entries => { inView = entries[0].isIntersecting; sync(); });
  observer.observe(video);
  sync();
})();
