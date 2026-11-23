# Behavior contract
- Native scroll only; each chapter is a tall section with a sticky copy panel; scene progress = section scroll fraction.
- Only the active scene is visible; it fades in on change. Canvas hides outside the story.
- Tree chips are buttons with `aria-pressed`; the outcome list is `aria-live="polite"`.
- Bureau bars show a tooltip on hover (desktop); copy explains the same data.
- Reduced motion: idle/time animation off; scroll-linked states remain. No WebGL: class `no-webgl`, chapters become normal sections, hero plays the original film.
