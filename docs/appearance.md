# Application appearance

The application starts in dark mode. Any signed-in user can select **Ayarlar → Görünüm → Açık** to use the existing light palette, or choose **Koyu** to return to dark mode. The preference is saved under `casebridge-theme` in this browser's local storage. Only `dark`/`light` is stored; no account, firm or credential data is included. The preference also applies to the login page and is independent of bureau administration permissions.

The server's root HTML defaults to `data-theme="dark"`. The head initializer validates the saved preference and sets the root theme/native color scheme before the body renders. `ThemeSync` handles storage changes from another tab. `AppearanceSettings` uses a shared theme snapshot and native radio controls. If storage is blocked, switching still applies to the current page/session; a future full reload defaults to dark again.

`src/app/theme.css` scopes all dark overrides to the root attribute, preserving the existing light-mode utility values. Status colors remain distinct; application images/documents are not inverted. The dark logo is a native SVG in `public/`. No backend configuration or database change is required.

Validation for this release: 739 frontend tests, production build/type checking, and synthetic desktop/mobile browser checks. Public deployment evidence is recorded in `todo.md` when verified.
