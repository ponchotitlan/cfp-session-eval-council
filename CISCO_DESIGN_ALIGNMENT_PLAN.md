# Cisco Design Alignment Plan

Scope decisions (confirmed with user):
- **Theme**: keep the app dark, but rebuild it on Cisco's documented **dark palette** tokens (design-system §2.3) instead of the current ad-hoc near-black/purple/cyan colors. No light theme, no theme switcher.
- **Fonts**: do **not** use CiscoSans. Use the failover stack only: `Arial, sans-serif, apple-system` (drop the Google Fonts `Open Sans` import and the `IBM Plex Mono` reference).
- **Icons**: leave emoji icons as-is. Not in scope.

Everything else (color tokens, spacing/radius scale, component shapes, transitions, accessibility) targets full compliance with the skill's dark-theme spec.

---

## Phase 0 — Design tokens (`src/App.css` root)

Add a `:root` block defining Cisco's dark-palette CSS custom properties (§2.3), plus the non-color scale variables (spacing, radius, breakpoints) as plain values since this app is single-page/no build-time SCSS vars needed:

- Color tokens: `--cisco-primary`, `--cisco-primary-dark` (hover), `--cisco-cyan`, `--cisco-cyan-light`, `--text-main/dark/gray/light-gray/white`, `--bg-page/main/white/light`, `--border-main/light/card/input/blue`, `--color-error/success/info/warning/disabled/disabled-text`, `--btn-primary*/--btn-secondary*`.
- Scale tokens: `--radius-button: 24px`, `--radius-input: 36px`, `--radius-card: 16px`, `--radius-tag: 18px`, `--radius-small: 4px`, `--space-xs/sm/md/lg/xl` (0.5/1/1.5/2/3rem).
- Agent identity colors (from `config/agents.js`) get remapped to Cisco-approved dark-theme hues instead of arbitrary hex — reuse the tag color family (§5.8) rather than inventing new ones:
  - `analyser` `#00C2FF` → `--cisco-cyan` (`#33C9F0`)
  - `researcher` `#A78BFA` → no Cisco purple token exists; remap to `--cisco-cyan-light` (`#7FD3EE`) to keep it distinct from analyser while staying on-palette
  - `committee` `#34D399` → `--color-success` (`#5FD97A`)
  - `audience` `#FB923C` → `--color-warning`-adjacent; Cisco's warning is yellow (`#FFEA3C`) which reads poorly as an accent — use `--color-info` (`#5BB0FC`) is already taken by analyser-ish blue, so keep audience on a distinct semantic: use `--color-error`'s lifted tone is wrong semantically (error ≠ audience). **Decision: introduce one additional non-error accent for audience, `#F0B429` (amber, AA on `--bg-page`), documented as a one-off "agent identity" color outside the core token set**, since Cisco's palette has no 4th neutral accent. Flag this explicitly to the user during implementation as the one deliberate deviation.

## Phase 1 — Typography

- Remove `@import url('https://fonts.googleapis.com/css2?family=Open+Sans...')` from `App.css`.
- Replace every `font-family: 'Open Sans', sans-serif` and `'IBM Plex Mono', monospace` with `font-family: Arial, sans-serif, apple-system` (the approved failover stack, no CiscoSans).
- Apply Cisco's dark-theme-appropriate type scale (§3.3) to existing text roles:
  - Body text stays 16px/400 (this app already skews smaller/denser; keep current sizes but fix weights to the 300/400/500 scale instead of arbitrary 700 everywhere)
  - `.idle-title` (currently 30px/700 gradient text) → h1 role, 40px/200, solid `--text-main` (drop the gradient-text effect — not a Cisco pattern)
  - `.running-status-title`, `.synthesis-output-title` gradient/solid-color text → same treatment, solid token color
  - Uppercase letter-spaced labels (`.field-label`, `.section-label`, `.agent-reports-label`, `.config-label`) keep uppercase+letter-spacing (acceptable stylistic choice, not disallowed) but move to `--text-gray`/`--text-light-gray` tokens and weight 500 instead of 700

## Phase 2 — Global & layout (`.app-root`, `.app-header`, `.page-content`)

- `.app-root` background → `var(--bg-page)`, text → `var(--text-main)`, font-family → failover stack
- Remove the decorative header gradient (`linear-gradient(90deg, #0A0B0F, #111320)`); use flat `var(--bg-main)`
- `.header-logo` gradient (`#00C2FF, #A78BFA`) → flat `var(--cisco-primary)` background (Cisco doesn't use decorative gradients on functional UI per §1)
- Convert hardcoded px spacing (`padding: 24px 40px`) to the rem/8px-grid scale: `padding: 1.5rem 2.5rem` (or nearest token)
- Scrollbar colors (`#0A0B0F`, `#1E2030`) → `var(--bg-page)` / `var(--border-main)`
- **Flag for user decision, not auto-changed**: `html { zoom: 1.50 }` at the top of `App.css` is a non-standard, largely deprecated CSS property with inconsistent browser support and no relation to the design system. Recommend removing it in favor of normal responsive sizing, but hold until confirmed since it may be an intentional accessibility/readability choice.

## Phase 3 — Form inputs (`Field.jsx`, `.input`, `.input--textarea`, `.config-input`)

- `.input` / `.config-input`: height `50px`, `border-radius: var(--radius-input)` (36px), border `1px solid var(--border-input)`, background `var(--bg-white)` (dark surface, not literal white), color `var(--text-main)`, `font-size: 14px`
- `.input--textarea`: override radius to `var(--radius-small)` (4px) per §5.3, keep `resize: vertical`
- Add real `:focus-visible` state: `outline: 4px solid rgba(59,130,246,0.25); border-color: var(--border-blue);` — currently inputs use `outline: none` with only a border-color transition, which fails the accessibility checklist (§7.1/§8.6)
- Placeholder color → `var(--text-light-gray)`
- Select (`ConfigPanel` model dropdown) gets the same treatment plus the chevron background-image pattern from §5.4

## Phase 4 — Buttons

All buttons currently use custom gradients, 8px radius, and 700-weight text. Replace with Cisco's pill-shaped button spec (§5.1), keeping each button's existing semantic role but mapping to a Cisco variant:

| Current class | Cisco variant | Notes |
|---|---|---|
| `.submit-btn` | Solid/Primary | flat `var(--btn-primary)` bg, `var(--btn-primary-text)`, radius 24px, height 48px |
| `.btn-save` | Solid/Primary | same as above |
| `.btn-continue` | Solid/Primary (small) | height 40px, radius 20px |
| `.btn-resubmit` | Outlined/Secondary | `var(--cisco-cyan-light)` border/text since it's a non-primary action |
| `.btn-export` | Soft | success-tinted soft background using `var(--color-success)` at low opacity, per §5.1 "Soft" variant |
| `.btn-reset`, `.btn-cancel`, `.btn-skip` | Minimal | no background/border, `var(--text-gray)` text only |
| `.config-btn`, `.api-key-reveal`, `.config-modal-close` | icon-only Minimal | keep circular/square icon-button shape but flatten colors to tokens |

All buttons: `transition: all ease-in-out 0.3s`, `:focus-visible` outline, `:disabled { opacity: 0.65; cursor: not-allowed; }`.

## Phase 5 — Cards

Apply `border-radius: var(--radius-card)` (16px) and the Cisco card shadow pattern (`0px 2px 5px rgba(0,0,0,0.07)` → `0px 2px 12px rgba(0,0,0,0.25)` on hover, adjusted for dark surfaces) to:

- `.agent-card-idle`, `.agent-progress-card`, `.synthesis-card`, `.score-card`, `.agent-report`, `.cfp-fallback`, `.config-modal`, `.synthesis-output`

Remove the glow/box-shadow-as-accent-color effects (`box-shadow: 0 0 24px #A78BFA22`, `0 0 20px ${a.color}22`) — replace active/highlighted state with a solid `border-color` change plus the standard elevation shadow, consistent with §6.3's documented hover/active patterns (no colored glows in the spec).

## Phase 6 — Tags, alerts, tooltips

- `.error-banner` → restyle as Cisco's `.alert--error` (§5.10): `border-left: 4px solid var(--color-error)`, background tinted error, radius 8px
- `.cfp-fallback` "fallback" banners → `.alert--info` or `.alert--warning` styling depending on context, rather than the current purple-glow card treatment
- `.info-tooltip` → align to §5.12 tooltip spec: dark surface `var(--bg-light)`, radius 4px (not 8px), remove the purple-tinted border (`#A78BFA44`) in favor of `var(--border-main)`
- Agent dots (`.agent-dot`) and per-agent accent borders keep using the remapped agent colors from Phase 0, not raw hex

## Phase 7 — Tabs (`.provider-tab`)

- Drop `font-family: 'IBM Plex Mono', monospace` (already covered in Phase 1)
- Align active/hover state colors to `var(--cisco-primary)` instead of `#A78BFA`
- Keep pill/tab shape but use `var(--radius-small)` consistently instead of the current `6px`

## Phase 8 — ConfigPanel modal specifics

- `.config-overlay` backdrop stays (`rgba(0,0,0,0.7)` + blur is acceptable, not spec'd against)
- `.config-modal` background → `var(--bg-white)`, border → `var(--border-card)`, radius → `var(--radius-card)`
- Replace remaining raw hex in inline `style={}` props in `ConfigPanel.jsx` (provider tab active state, delay tooltip colors, gear icon color) with the same CSS variables — this requires small JSX edits, not just CSS, since colors are currently passed as inline `style` objects

## Phase 9 — Markdown content (`.md-content`)

Apply the markdown heading scale from §3.3 ("Markdown Headings" table) using token colors instead of hardcoded `#E8E9F0`/`#A78BFA`:
- h1 32px/500, h2/h3 24px/500, h4 18px/500, h5 16px/500, h6 14px/500
- inline `code` background → `var(--bg-light)`, text → `var(--cisco-cyan)`
- blockquote border → `var(--border-main)` at reduced opacity, text → `var(--text-gray)`
- table header background → `var(--bg-light)`, borders → `var(--border-main)`

## Phase 10 — Accessibility pass

- Add `:focus-visible` outlines to every interactive element that's missing one (inputs, all buttons, tabs, the gear/close/reveal icon buttons)
- Audit color contrast for all remapped tokens against `var(--bg-page)` / `var(--bg-white)` (WCAG AA: 4.5:1 body text, 3:1 large text) — particularly the new audience-agent amber and the `--text-light-gray` / `--text-gray` low-emphasis text
- Add `aria-label` to icon-only buttons that currently rely only on `title` (`.config-btn`, `.config-modal-close`, `.api-key-reveal`)
- Confirm semantic structure: wrap the header in `<header>`, main content in `<main>`, keep `<label>` associations already present in `Field.jsx`

## Phase 11 — Verification

- Run the dev server (`npm run dev`) and visually check all four app phases (idle form, running, done/results, resubmit) plus the ConfigPanel modal
- Tab through the idle form and ConfigPanel with keyboard only to confirm focus rings are visible everywhere
- Spot-check computed contrast ratios for the remapped agent colors and new amber accent against the dark background tokens

---

## Open items requiring a call before/during implementation

1. **Audience agent color**: no Cisco token cleanly fits a 4th agent-identity accent; plan proposes a one-off amber (`#F0B429`) documented as a deliberate exception. Confirm or pick an alternative.
2. **`html { zoom: 1.50 }`**: flagged as non-standard and unrelated to the design system; recommend removing but not doing so without explicit confirmation, since it may be intentional.

Execution will proceed phase by phase per your instruction, committing/reviewing after each phase rather than as one large diff.
