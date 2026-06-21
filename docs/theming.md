# Theming

The app supports three theme modes — **System**, **Dark**, and **Light** — using CSS custom properties and Tailwind v4's `@theme inline` block.

## How it works

1. `src/main.tsx` calls `applyTheme(getTheme())` synchronously before React mounts, preventing any flash.
2. `applyTheme` resolves the stored preference (`"system"` reads `prefers-color-scheme`) and sets `data-theme` on `<html>`.
3. `src/index.css` defines `:root` (dark defaults) and `[data-theme="light"]` overrides.
4. The `@theme inline` block maps each CSS variable to a Tailwind utility class.

The user's choice is persisted in `localStorage` under the key `theme`.

## Token reference

### Background layers (darkest → lightest in dark mode)

| Token              | Utility            | Dark value  | Light value |
|--------------------|--------------------|-------------|-------------|
| `--theme-bg`       | `bg-theme-bg`      | `#0a0a0f`   | `#f8fafc`   |
| `--theme-surface`  | `bg-theme-surface` | `#0f172a`   | `#ffffff`   |
| `--theme-raised`   | `bg-theme-raised`  | `#1e293b`   | `#f1f5f9`   |
| `--theme-hover`    | `bg-theme-hover`   | `#334155`   | `#e2e8f0`   |

**When to use each layer:**
- `bg-theme-bg` — outermost app background
- `bg-theme-surface` — cards, modals, panels
- `bg-theme-raised` — inputs, select boxes, secondary buttons, kbd badges
- `bg-theme-hover` — hover state fills, kbd display inside the shortcut button

### Borders

| Token             | Utility               | Dark value | Light value |
|-------------------|-----------------------|------------|-------------|
| `--theme-line`    | `border-theme-line`   | `#1e293b`  | `#e2e8f0`   |
| `--theme-border`  | `border-theme-border` | `#334155`  | `#cbd5e1`   |
| `--theme-ring`    | `border-theme-ring`   | `#475569`  | `#94a3b8`   |

**When to use each border:**
- `border-theme-line` — subtle structural separators (card border, modal dividers)
- `border-theme-border` — default visible border (inputs, buttons at rest)
- `border-theme-ring` — focused or hovered interactive elements

### Text (highest → lowest contrast)

| Token        | Utility        | Dark value | Light value | Role              |
|--------------|----------------|------------|-------------|-------------------|
| `--theme-1`  | `text-theme-1` | `#f1f5f9`  | `#0f172a`   | Primary text      |
| `--theme-2`  | `text-theme-2` | `#cbd5e1`  | `#334155`   | Secondary text    |
| `--theme-3`  | `text-theme-3` | `#94a3b8`  | `#64748b`   | Labels, captions  |
| `--theme-4`  | `text-theme-4` | `#64748b`  | `#94a3b8`   | Muted / icons     |
| `--theme-5`  | `text-theme-5` | `#475569`  | `#cbd5e1`   | Placeholder / dim |

`placeholder-theme-4` and `placeholder-theme-5` work the same way via Tailwind's placeholder utilities.

## Accent colors

Accent colors (`emerald-*`, `red-*`, `amber-*`) are **not** theme-aware — they are intentional and look correct on both dark and light backgrounds. Use them freely for:
- Primary actions: `bg-emerald-600 hover:bg-emerald-500`
- Destructive actions: `bg-red-700 hover:bg-red-600`, `text-red-400`
- Urgency / warnings: `text-amber-400`
- Active selections: `bg-emerald-600/20 text-emerald-400 border-emerald-600/30`

## Checklist for new components

- [ ] No `bg-slate-*`, `text-slate-*`, or `border-slate-*` classes — use theme tokens instead
- [ ] Modals use `bg-theme-surface border-theme-border`
- [ ] Inputs use `bg-theme-raised border-theme-border focus:border-emerald-500`
- [ ] Section dividers use `border-theme-line`
- [ ] Primary text: `text-theme-1`; secondary/labels: `text-theme-2`/`text-theme-3`; muted: `text-theme-4`/`text-theme-5`

## `src/theme.ts` API

```ts
import { getTheme, setTheme, applyTheme, type Theme } from "../theme";

// Read current stored preference ("system" | "dark" | "light")
const current = getTheme();

// Apply without persisting (used on startup)
applyTheme("dark");

// Persist + apply (used by the Settings UI)
setTheme("light");
```

## Adding a new theme

1. Add a new `[data-theme="<name>"]` block in `src/index.css` overriding the CSS variables.
2. Add the new value to the `Theme` union type in `src/theme.ts`.
3. Add the new option to the `themes` array in `SettingsModal.tsx`.
4. Add the i18n keys `settings.themes.<name>` to both `pt-BR.json` and `en-US.json`.
