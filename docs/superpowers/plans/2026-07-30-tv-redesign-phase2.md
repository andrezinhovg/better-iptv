# TV Redesign Phase 2: Theme Toggle + Remaining Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the light/dark/system theme toggle so it actually works (currently a no-op), and finish applying the design-token system from phase 1 (`docs/superpowers/plans/2026-07-30-tv-redesign.md`, merged in commit `17426bf`) to every remaining component that still uses hardcoded gray/blue Tailwind classes: `ProfileManager.tsx`, the 5 files in `modals/`, `Setup.tsx`, `App.tsx`, `ErrorBoundary.tsx`, `LoadingScreen.tsx`, plus deleting dead code (`ChannelHeader.tsx`) and fixing one missed spot from phase 1 (`AboutTab.tsx:95`).

**Architecture:** Phase 1 already built the token layer (`src/index.css` CSS variables, `tailwind.config.js` color/fontSize extension) — this phase only *consumes* it, using the exact same substitution table phase 1 established. The one piece of new logic is a small theme-application hook (`src/hooks/useTheme.ts`) that reads the persisted theme setting and toggles `document.documentElement`'s `dark` class — this was never wired in phase 1 or before it. Everything else is mechanical restyling in an isolated git worktree.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind CSS + Tauri (existing stack, no new dependencies).

## Global Constraints

- Frontend-only (`src/`, `index.html`). No changes under `src-tauri/` — the settings backend (`get_setting`/`set_setting` generic string key/value store) already works correctly and needs no changes; only the frontend needs to read and apply the value.
- Unlike phase 1, this phase **does** add new logic: the `useTheme` hook and its wiring in `App.tsx`/`Settings.tsx`. This is a deliberate, narrow exception — do not use it as license to touch unrelated hook/store logic. `src/stores/player-store.ts` is not touched.
- Existing vitest suite (`src/test/`) must keep passing unmodified.
- All work happens in a new git worktree `~/Projects/better-iptv-tv-redesign-phase2` on branch `feature/tv-redesign-phase2`, branched from `main` in `~/Projects/better-iptv` (which already has phase 1 merged, commit `17426bf`). `~/Projects/better-iptv` itself is never modified by this plan except by the final merge.
- Validate visually with `npm run tauri dev` (real Rust IPC backend, real data) after every task, same as phase 1.
- No production Tauri build/cutover is part of this plan — that happens after user approval, as a separate step.

---

## Design tokens (recap from phase 1 — same substitution table applies)

| Old class(es) | New class |
|---|---|
| `bg-gray-50` (light bg), `dark:bg-gray-900` | `bg-bg` |
| `bg-white`, `dark:bg-gray-800` (card/panel/modal surface) | `bg-surface` |
| `bg-gray-100`, `bg-gray-200`, `bg-gray-700`, `dark:bg-gray-700` (hover/secondary surface) | `bg-surface-hover` |
| `text-gray-900`, `dark:text-white` | `text-text` |
| `text-gray-400/500/600/700`, `dark:text-gray-300/400` | `text-text-muted` |
| `border-gray-200/300`, `dark:border-gray-600/700` | `border-border` |
| `bg-blue-600`, `hover:bg-blue-700` (generic accent button) | `bg-accent`, `hover:bg-accent-hover` |
| `text-blue-600`, `dark:text-blue-400` | `text-accent` |
| `border-blue-600`, `dark:border-blue-400` | `border-accent` |
| `focus:border-blue-500`, `focus:ring-blue-500` | `focus:border-accent`, `focus:ring-accent` |
| `text-xs` | `text-fluid-xs` |
| `text-sm` | `text-fluid-sm` |
| `text-base` | `text-fluid-base` |
| `text-lg` | `text-fluid-lg` |
| `text-xl` | `text-fluid-xl` |
| `text-2xl` | `text-fluid-2xl` |
| `text-3xl` | `text-fluid-3xl` |

**Neutral solid buttons** (`bg-gray-500`/`bg-gray-600` with `text-white`, e.g. "Cancel"/"Rename" buttons): phase 1's Task 10 fix round established the pattern for these — convert to `bg-surface-hover ... hover:bg-border` with `text-text` (not `text-white`, since `bg-surface-hover` is light in light mode). Apply the same pattern here everywhere a solid neutral-gray action button appears.

**Semantic colors are always left alone** — established throughout phase 1, applies here too: red for errors/destructive actions/danger variants, green for success/positive stats, and any other color used to encode meaning rather than as generic UI chrome. This plan calls out every specific instance per task below; when in doubt, a color tied to a specific meaning (error, success, danger, "removed" vs "added") stays; a color used only because it happened to be the default accent (mostly `blue-600`) converts.

**Gradients:** phase 1 introduced no gradient token. Three files below have hardcoded `bg-gradient-to-br from-X to-Y` backgrounds (two identical `blue-50`→`indigo-100`/`gray-900`→`gray-800` gradients in `Setup.tsx` and `App.tsx`, one `gray-900`→`gray-800`→`gray-900` gradient in `LoadingScreen.tsx`). This plan flattens all three to plain `bg-bg` — consistent with the rest of the app, no new token invented, matches YAGNI.

---

### Task 1: Create the isolated git worktree

**Files:** none (repo/worktree setup only)

- [ ] **Step 1: Verify the main repo is clean and on `main`**

```bash
cd ~/Projects/better-iptv
git status --short
git branch --show-current
git log --oneline -1
```

Expected: no uncommitted changes, current branch `main`, latest commit is `17426bf` (or later, if the user has pushed/pulled since).

- [ ] **Step 2: Create the worktree on a new branch**

```bash
git worktree add -b feature/tv-redesign-phase2 ~/Projects/better-iptv-tv-redesign-phase2 main
```

Expected: new directory `~/Projects/better-iptv-tv-redesign-phase2` created, checked out on branch `feature/tv-redesign-phase2`.

- [ ] **Step 3: Install frontend dependencies in the new worktree**

```bash
cd ~/Projects/better-iptv-tv-redesign-phase2
npm install
```

Expected: completes without error (separate `node_modules` from the main checkout).

- [ ] **Step 4: Confirm the dev server runs**

```bash
npm run tauri dev
```

Expected: app window opens showing the current (phase-1-redesigned) UI, connected to the same local SQLite data as the production install. Stop it (Ctrl+C) once confirmed.

> All remaining tasks operate inside `~/Projects/better-iptv-tv-redesign-phase2`.

---

### Task 2: Wire the theme toggle

**Files:**
- Create: `src/hooks/useTheme.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/Settings.tsx`
- Modify: `index.html`

**Interfaces:**
- Consumes: `Theme` type from `src/components/settings/constants.ts` (already exists: `export type Theme = 'light' | 'dark' | 'system';`), `getSetting`/`setSetting` from `src/lib/tauri.ts` (already exist, unchanged).
- Produces: `applyTheme(theme: Theme): void` and `useTheme(): void`, exported from `src/hooks/useTheme.ts`. `applyTheme` is consumed directly by `Settings.tsx` (no new prop/event system). `useTheme` is called once, in `App.tsx`.

This is the one task in this plan with real (small) new logic, not just className substitution. Root cause of the current bug: `index.html` hardcodes `<html class="dark">` and nothing in the codebase ever calls `document.documentElement.classList` — the theme setting is faithfully persisted to SQLite and faithfully reloaded into `Settings.tsx`'s local state (so the picker shows the right selection), but nothing ever applies it to the DOM.

- [ ] **Step 1: Create `src/hooks/useTheme.ts`**

```ts
import { useEffect } from 'react';
import { getSetting } from '../lib/tauri';
import type { Theme } from '../components/settings/constants';

// Module-level, not component state: this is the single source of truth for
// "what theme is currently active," shared between the mount-time effect
// below and any component (e.g. Settings.tsx) that calls applyTheme directly
// for a live preview. A plain shared variable is simpler than adding a store
// or event bus for one boolean-ish piece of state.
let activeTheme: Theme = 'system';

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Applies a theme to the document immediately and remembers it as active. */
export function applyTheme(theme: Theme): void {
  activeTheme = theme;
  const isDark = theme === 'system' ? systemPrefersDark() : theme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
}

/**
 * Loads the persisted theme setting on mount and applies it, then keeps the
 * page in sync with OS-level theme changes while 'system' is active. Call
 * this once, at the app root.
 */
export function useTheme(): void {
  useEffect(() => {
    getSetting('theme').then((saved) => {
      applyTheme((saved as Theme) || 'system');
    });

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = () => {
      if (activeTheme === 'system') {
        applyTheme('system');
      }
    };
    mediaQuery.addEventListener('change', handleSystemChange);

    return () => {
      mediaQuery.removeEventListener('change', handleSystemChange);
    };
  }, []);
}
```

- [ ] **Step 2: Wire `useTheme()` into `App.tsx`**

`App.tsx` is the single always-mounted root component (it wraps both `<Setup />` and `<MainScreen />` via `ErrorBoundary`), so it's the correct single place to apply the theme for the whole app lifetime — not `Settings.tsx`, which unmounts every time the modal closes.

Old (lines 1-9):
```tsx
import { useEffect, useState } from 'react';
import Setup from './components/Setup';
import MainScreen from './components/MainScreen';
import ErrorBoundary from './components/ErrorBoundary';
import { usePlayerStore } from './stores/player-store';
import { getPlaylists, getChannels, getActiveProfileId } from './lib/tauri';
import { logger } from './lib/logger';

export default function App() {
```

New:
```tsx
import { useEffect, useState } from 'react';
import Setup from './components/Setup';
import MainScreen from './components/MainScreen';
import ErrorBoundary from './components/ErrorBoundary';
import { usePlayerStore } from './stores/player-store';
import { getPlaylists, getChannels, getActiveProfileId } from './lib/tauri';
import { logger } from './lib/logger';
import { useTheme } from './hooks/useTheme';

export default function App() {
  useTheme();
```

(The `useTheme()` call is the first line inside the function body, before the existing `const { ... } = usePlayerStore();` destructure.)

- [ ] **Step 3: Wire live-preview + revert-on-cancel into `Settings.tsx`**

Currently `Settings.tsx` loads the saved theme into local state (`theme`/`setTheme`), passes `theme`/`onThemeChange={setTheme}` down to `GeneralTab`, and only persists on Save (`await setSetting('theme', theme)`) — nothing ever calls `applyTheme`. This task makes theme changes preview live (the whole point of a theme picker), and reverts the live preview if the user cancels/closes without saving — mirroring the existing `epgUrl`/`originalEpgUrl` pattern already in this file for the same "live-edited vs persisted" concern.

Import the hook (near the top, with the other local imports):

Old (line 13):
```tsx
import { logger } from '../lib/logger';
```

New:
```tsx
import { logger } from '../lib/logger';
import { applyTheme } from '../hooks/useTheme';
```

Add an `originalTheme` state next to the existing `theme` state:

Old (line 53):
```tsx
  const [theme, setTheme] = useState<Theme>('system');
```

New:
```tsx
  const [theme, setTheme] = useState<Theme>('system');
  const [originalTheme, setOriginalTheme] = useState<Theme>('system');
```

Record the original value when settings load (in the same effect that already does `if (savedTheme) setTheme(savedTheme as Theme);`):

Old (line 96):
```tsx
        if (savedTheme) setTheme(savedTheme as Theme);
```

New:
```tsx
        if (savedTheme) {
          setTheme(savedTheme as Theme);
          setOriginalTheme(savedTheme as Theme);
        }
```

Add a live-preview handler and a close handler that reverts an unsaved preview. Place these right after `handleSave` (after its closing `};` at line 314):

```tsx

  // Theme changes preview immediately; handleSave persists, handleClose
  // (used by Cancel and the X button) reverts to the last-saved value.
  const handleThemeChange = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
  };

  const handleClose = () => {
    applyTheme(originalTheme);
    onClose();
  };
```

Update the two places that currently call `onClose` directly for a *cancel* path (the X button and the footer Cancel button) to call `handleClose` instead. `handleSave`'s own `onClose()` call (already-saved path, no revert needed) stays as-is.

Old (X button, around line 322-323):
```tsx
          <button
            onClick={onClose}
            className="rounded-lg p-2 transition-colors hover:bg-surface-hover"
          >
```

New:
```tsx
          <button
            onClick={handleClose}
            className="rounded-lg p-2 transition-colors hover:bg-surface-hover"
          >
```

Old (footer Cancel button, around line 400-406 — find by the `border-t border-border` footer div and the `Cancel` button text):
```tsx
        <div className="flex items-center justify-end gap-3 border-t border-border p-6">
          <button
            onClick={onClose}
```

New:
```tsx
        <div className="flex items-center justify-end gap-3 border-t border-border p-6">
          <button
            onClick={handleClose}
```

Finally, pass `handleThemeChange` instead of `setTheme` to `GeneralTab`:

Old (around line 348-349):
```tsx
                theme={theme}
                onThemeChange={setTheme}
```

New:
```tsx
                theme={theme}
                onThemeChange={handleThemeChange}
```

`GeneralTab.tsx` itself needs no changes — its `onThemeChange` prop is already typed as `(t: Theme) => void` and just calls whatever function it's given.

- [ ] **Step 4: Update `index.html`**

Old:
```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Better IPTV</title>
  </head>

  <body class="bg-gray-900">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

New:
```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Better IPTV</title>
  </head>

  <body class="bg-bg">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

(Note: `class="dark"` on `<html>` is deliberately KEPT as the static default, not removed. The theme setting lives in SQLite and is only readable asynchronously via Tauri IPC — there's no synchronous way to know the right class before first paint. Defaulting to dark avoids a flash-to-light for the common case (dark, or system with a dark OS theme) since `useTheme()`'s effect corrects it immediately after mount for the less common case of an explicit light preference. Only the `<body>` background class needed to change, since `bg-gray-900` was hardcoded independent of the token system.)

- [ ] **Step 5: Type-check and verify all three theme modes live**

```bash
npx tsc --noEmit
npm run tauri dev
```

Open Settings → General → Appearance. Click "Light" — the whole app should immediately switch to light colors (not just the picker). Click "Dark" — switches back immediately. Click "System" — matches your current OS theme. With each selection, click the X (not Save) to close, then reopen Settings — the picker should show the last **saved** value (not necessarily the last one you clicked), and the app's visible theme should have reverted to match. Then pick a theme and click "Save Changes" — reopen Settings, the picker and the app should both reflect the saved choice. Close the app.

- [ ] **Step 6: Run the existing test suite to confirm no regression**

```bash
npm run test:run
```

Expected: all existing tests pass unchanged — this task added a new hook with no existing test coverage to break, and touched no store/hook logic that has tests.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useTheme.ts src/App.tsx src/components/Settings.tsx index.html
git commit -m "feat(tv-redesign-phase2): wire theme toggle (light/dark/system) — was previously a no-op"
```

---

### Task 3: Restyle `ProfileManager.tsx`

**Files:**
- Modify: `src/components/ProfileManager.tsx`

**Interfaces:**
- Consumes: tokens from phase 1.
- No prop/behavior changes — same `ProfileManagerProps` interface.

- [ ] **Step 1: Swap the header and "Create New Profile" button (lines 171-179)**

Old:
```tsx
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Profiles</h3>
          <button
            onClick={() => setShowSetupModal(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
          >
            <span className="text-xl">+</span>
            Create New Profile
          </button>
        </div>
```

New:
```tsx
        <div className="flex items-center justify-between">
          <h3 className="text-fluid-lg font-semibold text-text">Profiles</h3>
          <button
            onClick={() => setShowSetupModal(true)}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-white transition-colors hover:bg-accent-hover"
          >
            <span className="text-fluid-xl">+</span>
            Create New Profile
          </button>
        </div>
```

- [ ] **Step 2: Swap the profile card container and its active/inactive styling (lines 190-196)**

Old:
```tsx
              <div
                key={playlist.id}
                className={`rounded-lg border-2 p-4 transition-all ${
                  isActive
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800'
                }`}
              >
```

New:
```tsx
              <div
                key={playlist.id}
                className={`rounded-lg border-2 p-4 transition-all ${
                  isActive ? 'border-accent bg-accent/10' : 'border-border bg-surface'
                }`}
              >
```

- [ ] **Step 3: Swap the rename input and name/type text (lines 200, 207, 215, 219)**

Old:
```tsx
                    <div className="text-2xl">{icon}</div>
                    <div className="flex-1">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-3 py-1 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(playlist.id!);
                            if (e.key === 'Escape') handleCancelRename();
                          }}
                        />
                      ) : (
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {playlist.name}
                        </h3>
                      )}
                      <p className="text-sm text-gray-600 dark:text-gray-400">Type: {type}</p>
                    </div>
```

New:
```tsx
                    <div className="text-fluid-2xl">{icon}</div>
                    <div className="flex-1">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-md border border-border bg-surface px-3 py-1 text-text"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(playlist.id!);
                            if (e.key === 'Escape') handleCancelRename();
                          }}
                        />
                      ) : (
                        <h3 className="font-semibold text-text">{playlist.name}</h3>
                      )}
                      <p className="text-fluid-sm text-text-muted">Type: {type}</p>
                    </div>
```

- [ ] **Step 4: Swap the Active badge and action buttons (lines 224-267)**

Old:
```tsx
                    {isActive ? (
                      <span className="rounded-full bg-blue-600 px-3 py-1 text-sm font-medium text-white">
                        Active
                      </span>
                    ) : (
                      <button
                        onClick={() => handleActivateProfile(playlist)}
                        className="rounded-md bg-green-600 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-green-700"
                      >
                        Activate
                      </button>
                    )}

                    {isEditing ? (
                      <>
                        <button
                          onClick={() => handleSaveRename(playlist.id!)}
                          className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancelRename}
                          className="rounded-md bg-gray-500 px-3 py-1 text-sm text-white hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleStartRename(playlist)}
                          className="rounded-md bg-gray-600 px-3 py-1 text-sm text-white hover:bg-gray-700"
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => handleDeleteProfile(playlist.id!)}
                          className="rounded-md bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </>
                    )}
```

New:
```tsx
                    {isActive ? (
                      <span className="rounded-full bg-accent px-3 py-1 text-fluid-sm font-medium text-white">
                        Active
                      </span>
                    ) : (
                      <button
                        onClick={() => handleActivateProfile(playlist)}
                        className="rounded-md bg-green-600 px-3 py-1 text-fluid-sm font-medium text-white transition-colors hover:bg-green-700"
                      >
                        Activate
                      </button>
                    )}

                    {isEditing ? (
                      <>
                        <button
                          onClick={() => handleSaveRename(playlist.id!)}
                          className="rounded-md bg-accent px-3 py-1 text-fluid-sm text-white hover:bg-accent-hover"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancelRename}
                          className="rounded-md bg-surface-hover px-3 py-1 text-fluid-sm text-text hover:bg-border"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleStartRename(playlist)}
                          className="rounded-md bg-surface-hover px-3 py-1 text-fluid-sm text-text hover:bg-border"
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => handleDeleteProfile(playlist.id!)}
                          className="rounded-md bg-red-600 px-3 py-1 text-fluid-sm text-white hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </>
                    )}
```

(`bg-green-600`/`hover:bg-green-700` "Activate" and `bg-red-600`/`hover:bg-red-700` "Delete" are semantic — left as-is, same convention as phase 1.)

- [ ] **Step 5: Swap the delete-warning modal (lines 285-307)**

Old:
```tsx
          <div className="max-w-md rounded-lg bg-white p-6 dark:bg-gray-800">
            <h3 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
              Delete Last Profile?
            </h3>
            <p className="mb-6 text-gray-700 dark:text-gray-300">
              This is your only profile. If you delete it, the onboarding process will start again
              and you'll need to add a new playlist.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteWarning(null)}
                className="rounded-lg bg-gray-500 px-4 py-2 text-white hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteLastProfile}
                className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
              >
                Delete and Restart
              </button>
            </div>
          </div>
```

New:
```tsx
          <div className="max-w-md rounded-lg bg-surface p-6">
            <h3 className="mb-4 text-fluid-xl font-bold text-text">Delete Last Profile?</h3>
            <p className="mb-6 text-fluid-base text-text-muted">
              This is your only profile. If you delete it, the onboarding process will start again
              and you'll need to add a new playlist.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteWarning(null)}
                className="rounded-lg bg-surface-hover px-4 py-2 text-text hover:bg-border"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteLastProfile}
                className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
              >
                Delete and Restart
              </button>
            </div>
          </div>
```

- [ ] **Step 6: Type-check and visually verify**

```bash
npx tsc --noEmit
npm run tauri dev
```

Open Settings → Profiles. Confirm the profile list, active/inactive card styling, rename flow, and delete-warning modal all use the new tokens in both light and dark (Task 2's toggle now works — check both). Close the app.

- [ ] **Step 7: Commit**

```bash
git add src/components/ProfileManager.tsx
git commit -m "feat(tv-redesign-phase2): restyle ProfileManager with design tokens"
```

---

### Task 4: Restyle `ConfirmationModal.tsx` and `ErrorModal.tsx`

**Files:**
- Modify: `src/components/modals/ConfirmationModal.tsx`
- Modify: `src/components/modals/ErrorModal.tsx`

**Interfaces:**
- Consumes: tokens from phase 1. No prop/behavior changes to either component.

- [ ] **Step 1: Replace `ConfirmationModal.tsx`'s JSX (lines 32-77)**

Old:
```tsx
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {confirmVariant === 'danger' && (
              <div className="rounded-full bg-red-100 p-2 dark:bg-red-900/20">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
            )}
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Message */}
        <div className="mb-6">
          <p className="text-gray-700 dark:text-gray-300">{message}</p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg bg-gray-500 px-4 py-2 text-white hover:bg-gray-600"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`rounded-lg px-4 py-2 text-white ${
              confirmVariant === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
```

New:
```tsx
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {confirmVariant === 'danger' && (
              <div className="rounded-full bg-red-100 p-2 dark:bg-red-900/20">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
            )}
            <h3 className="text-fluid-xl font-bold text-text">{title}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-surface-hover">
            <X className="h-5 w-5 text-text-muted" />
          </button>
        </div>

        {/* Message */}
        <div className="mb-6">
          <p className="text-fluid-base text-text-muted">{message}</p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg bg-surface-hover px-4 py-2 text-text hover:bg-border"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`rounded-lg px-4 py-2 text-white ${
              confirmVariant === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-accent hover:bg-accent-hover'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
```

(`bg-red-100 dark:bg-red-900/20` icon badge and `text-red-600 dark:text-red-400` icon color are kept as-is — semantic danger-variant styling, not generic chrome. The danger branch of the confirm button, `bg-red-600 hover:bg-red-700`, is also kept.)

- [ ] **Step 2: Replace `ErrorModal.tsx`'s JSX (lines 21-54)**

Old:
```tsx
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-red-100 p-2 dark:bg-red-900/20">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Error Message */}
        <div className="mb-6">
          <p className="text-gray-700 dark:text-gray-300">{message}</p>
        </div>

        {/* Action */}
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
```

New:
```tsx
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-red-100 p-2 dark:bg-red-900/20">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-fluid-xl font-bold text-text">{title}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-surface-hover">
            <X className="h-5 w-5 text-text-muted" />
          </button>
        </div>

        {/* Error Message */}
        <div className="mb-6">
          <p className="text-fluid-base text-text-muted">{message}</p>
        </div>

        {/* Action */}
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
```

(This modal is error-only by definition — its icon badge and its single action button both stay red, that's not a "generic accent" use, it's the whole point of the component.)

- [ ] **Step 3: Type-check and visually verify**

```bash
npx tsc --noEmit
npm run tauri dev
```

Trigger an error modal (e.g. try renaming a profile to an empty string in Settings → Profiles) and a confirmation modal (e.g. Settings → Parental → Reset PIN, if a PIN is set) to see both variants (`primary` and `danger`). Confirm tokens render correctly in both themes. Close the app.

- [ ] **Step 4: Commit**

```bash
git add src/components/modals/ConfirmationModal.tsx src/components/modals/ErrorModal.tsx
git commit -m "feat(tv-redesign-phase2): restyle ConfirmationModal and ErrorModal with design tokens"
```

---

### Task 5: Restyle `PinEntryModal.tsx`

**Files:**
- Modify: `src/components/modals/PinEntryModal.tsx`

**Interfaces:**
- Consumes: tokens from phase 1. No prop/behavior changes — same `PinEntryModalProps`, same `set`/`change`/`verify` mode logic untouched.

- [ ] **Step 1: Replace the modal shell and header (lines 113-126)**

Old:
```tsx
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            {title || (mode === 'set' ? 'Set PIN' : mode === 'change' ? 'Change PIN' : 'Enter PIN')}
          </h3>
          <button
            onClick={handleClose}
            className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
```

New:
```tsx
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-fluid-xl font-bold text-text">
            {title || (mode === 'set' ? 'Set PIN' : mode === 'change' ? 'Change PIN' : 'Enter PIN')}
          </h3>
          <button onClick={handleClose} className="rounded-lg p-1 hover:bg-surface-hover">
            <X className="h-5 w-5 text-text-muted" />
          </button>
        </div>
```

- [ ] **Step 2: Replace the three PIN input fields (lines 130-179)**

All three inputs share the identical label/input class pair. Old (appears 3 times, for "Current PIN"/"PIN", "PIN"/"New PIN", and "Confirm PIN"):
```tsx
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
```
and
```tsx
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-center text-2xl tracking-widest focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
```

New (use `replace_all` for each — the strings repeat verbatim across all three fields):
```tsx
              <label className="mb-2 block text-fluid-sm font-medium text-text-muted">
```
and
```tsx
                className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-center text-fluid-2xl tracking-widest text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
```

- [ ] **Step 3: Replace the error message and hint text (lines 184-191)**

Old:
```tsx
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="text-xs text-gray-500 dark:text-gray-400">
            {mode !== 'verify' && 'PIN must be 4-6 digits containing only numbers.'}
          </div>
```

New:
```tsx
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-fluid-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="text-fluid-xs text-text-muted">
            {mode !== 'verify' && 'PIN must be 4-6 digits containing only numbers.'}
          </div>
```

(Error banner colors stay semantic red — only the font-size token changed.)

- [ ] **Step 4: Replace the action buttons (lines 196-220)**

Old:
```tsx
          <button
            onClick={handleClose}
            className="rounded-lg bg-gray-500 px-4 py-2 text-white hover:bg-gray-600 disabled:opacity-50"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
```

New:
```tsx
          <button
            onClick={handleClose}
            className="rounded-lg bg-surface-hover px-4 py-2 text-text hover:bg-border disabled:opacity-50"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="rounded-lg bg-accent px-4 py-2 text-white hover:bg-accent-hover disabled:opacity-50"
```

(The rest of the submit button — the `disabled` prop and its condition — is unchanged, only the className shown above changes.)

- [ ] **Step 5: Type-check and visually verify**

```bash
npx tsc --noEmit
npm run tauri dev
```

Open Settings → Parental → Set PIN (and, if already set, Change PIN). Confirm all three PIN entry flows (set/change/verify) render with the new tokens in both themes, and an invalid PIN still shows the red error banner. Close the app.

- [ ] **Step 6: Commit**

```bash
git add src/components/modals/PinEntryModal.tsx
git commit -m "feat(tv-redesign-phase2): restyle PinEntryModal with design tokens"
```

---

### Task 6: Restyle `RefreshModal.tsx`

**Files:**
- Modify: `src/components/modals/RefreshModal.tsx`

**Interfaces:**
- Consumes: tokens from phase 1. No prop/behavior changes — same `RefreshModalProps`, same progress-event listening logic untouched.

**Design decision:** the "New / Updated / Removed" stats grid uses green/blue/red as a semantic triad (added/changed/deleted), not blue-as-generic-accent — those three specific colors are kept exactly as-is per this task, not converted to `text-accent`. Everything else (modal chrome, header, buttons, secondary text) converts normally.

- [ ] **Step 1: Replace the modal shell, header, and refreshing state (lines 78-113)**

Old:
```tsx
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            {result ? 'Refresh Complete' : 'Refreshing Playlist'}
          </h3>
          {(result || error) && (
            <button
              onClick={onClose}
              className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="space-y-4">
          {isRefreshing && (
            <>
              <div className="flex items-center gap-3">
                <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
                <span className="text-gray-700 dark:text-gray-300">
                  Refreshing "{playlistName}"...
                </span>
              </div>
              {progress && (
                <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  {progress.live_count > 0 && <p>Live channels: {progress.live_count}</p>}
                  {progress.vod_count > 0 && <p>VOD: {progress.vod_count}</p>}
                  {progress.series_count > 0 && <p>Series: {progress.series_count}</p>}
                </div>
              )}
            </>
          )}
```

New:
```tsx
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-fluid-xl font-bold text-text">
            {result ? 'Refresh Complete' : 'Refreshing Playlist'}
          </h3>
          {(result || error) && (
            <button onClick={onClose} className="rounded-lg p-1 hover:bg-surface-hover">
              <X className="h-5 w-5 text-text-muted" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="space-y-4">
          {isRefreshing && (
            <>
              <div className="flex items-center gap-3">
                <RefreshCw className="h-5 w-5 animate-spin text-accent" />
                <span className="text-fluid-base text-text-muted">
                  Refreshing "{playlistName}"...
                </span>
              </div>
              {progress && (
                <div className="space-y-1 text-fluid-sm text-text-muted">
                  {progress.live_count > 0 && <p>Live channels: {progress.live_count}</p>}
                  {progress.vod_count > 0 && <p>VOD: {progress.vod_count}</p>}
                  {progress.series_count > 0 && <p>Series: {progress.series_count}</p>}
                </div>
              )}
            </>
          )}
```

(The spinning `RefreshCw` icon color, `text-blue-500` → `text-accent`, is a generic in-progress indicator, not a semantic status color — converts normally.)

- [ ] **Step 2: Replace the result state, keeping the stat colors semantic (lines 115-149)**

Old:
```tsx
          {result && (
            <>
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-gray-700 dark:text-gray-300">Refresh complete</span>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700/50">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {result.added}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">New</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {result.updated}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Updated</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {result.removed}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Removed</p>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
              >
                Done
              </button>
            </>
          )}

          {error && (
            <>
              <p className="text-red-500 dark:text-red-400">Failed to refresh playlist: {error}</p>
              <button
                onClick={onClose}
                className="w-full rounded-lg bg-gray-500 px-4 py-2 text-white transition-colors hover:bg-gray-600"
              >
                Close
              </button>
            </>
          )}
```

New:
```tsx
          {result && (
            <>
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-fluid-base text-text-muted">Refresh complete</span>
              </div>
              <div className="rounded-lg border border-border bg-surface-hover p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-fluid-2xl font-bold text-green-600 dark:text-green-400">
                      {result.added}
                    </p>
                    <p className="text-fluid-xs text-text-muted">New</p>
                  </div>
                  <div>
                    <p className="text-fluid-2xl font-bold text-blue-600 dark:text-blue-400">
                      {result.updated}
                    </p>
                    <p className="text-fluid-xs text-text-muted">Updated</p>
                  </div>
                  <div>
                    <p className="text-fluid-2xl font-bold text-red-600 dark:text-red-400">
                      {result.removed}
                    </p>
                    <p className="text-fluid-xs text-text-muted">Removed</p>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-full rounded-lg bg-accent px-4 py-2 text-white transition-colors hover:bg-accent-hover"
              >
                Done
              </button>
            </>
          )}

          {error && (
            <>
              <p className="text-red-500 dark:text-red-400">Failed to refresh playlist: {error}</p>
              <button
                onClick={onClose}
                className="w-full rounded-lg bg-surface-hover px-4 py-2 text-text transition-colors hover:bg-border"
              >
                Close
              </button>
            </>
          )}
```

(`text-green-500`/`text-green-600 dark:text-green-400` (added), `text-blue-600 dark:text-blue-400` (updated), `text-red-600 dark:text-red-400` (removed), and the error `text-red-500 dark:text-red-400` are ALL kept exactly as-is — this is the semantic triad called out above. Only the stat panel's own container chrome, the "New"/"Updated"/"Removed" labels, and the two action buttons converted.)

- [ ] **Step 3: Type-check and visually verify**

```bash
npx tsc --noEmit
npm run tauri dev
```

Open Settings → General → click "Refresh Playlist" (or trigger via whatever UI path calls `RefreshModal`). Confirm the in-progress state, the completed state (green/blue/red stats unchanged), and an error state (if you can trigger one, e.g. temporarily break connectivity) all render correctly in both themes. Close the app.

- [ ] **Step 4: Commit**

```bash
git add src/components/modals/RefreshModal.tsx
git commit -m "feat(tv-redesign-phase2): restyle RefreshModal chrome with design tokens, keep stat colors semantic"
```

---

### Task 7: Restyle `ChannelBlockingModal.tsx`

**Files:**
- Modify: `src/components/modals/ChannelBlockingModal.tsx`

**Interfaces:**
- Consumes: tokens from phase 1. No prop/behavior changes — same `ChannelBlockingModalProps`, same virtualized-list logic untouched.

**Important:** this file uses `@tanstack/react-virtual` for the channel list (lines 177-197 in the current file) with **inline `style={{...}}` for `position`/`height`/`transform`** — those inline styles are structural virtualizer positioning, not color/theme related. Do not touch them; only the `className` strings throughout this file change.

- [ ] **Step 1: Replace the modal shell and header (lines 120-136)**

Old:
```tsx
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="flex h-[80vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-700">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Block Channels</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {blockedIds.size} of {channels.length} channels blocked
            </p>
          </div>
          <button
            onClick={handleCancel}
            className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
```

New:
```tsx
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="flex h-[80vh] w-full max-w-3xl flex-col rounded-lg bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-6">
          <div>
            <h3 className="text-fluid-xl font-bold text-text">Block Channels</h3>
            <p className="mt-1 text-fluid-sm text-text-muted">
              {blockedIds.size} of {channels.length} channels blocked
            </p>
          </div>
          <button onClick={handleCancel} className="rounded-lg p-1 hover:bg-surface-hover">
            <X className="h-5 w-5 text-text-muted" />
          </button>
        </div>
```

- [ ] **Step 2: Replace the search bar and "Block/Unblock All" button (lines 139-167)**

Old:
```tsx
        <div className="border-b border-gray-200 p-4 dark:border-gray-700">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search channels..."
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <button
              onClick={toggleAll}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
            >
```

New:
```tsx
        <div className="border-b border-border p-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search channels..."
                className="w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-4 text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <button
              onClick={toggleAll}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 hover:bg-surface-hover"
            >
```

(The `<span className="text-sm">Unblock All</span>` / `<span className="text-sm">Block All</span>` a few lines below this — inside the button, unchanged in the diff above — also need `text-sm` → `text-fluid-sm`; apply that with `replace_all` since it's the same string in both branches of that ternary.)

- [ ] **Step 3: Replace the "No channels found" empty state and each virtualized row's content (lines 172-176, 199-219)**

Old (empty state, line 172-175):
```tsx
            <div className="py-12 text-center text-gray-500 dark:text-gray-400">
              No channels found
            </div>
```

New:
```tsx
            <div className="py-12 text-center text-fluid-base text-text-muted">
              No channels found
            </div>
```

Old (row content, lines 199-219 — inside the virtualized row wrapper, whose `style={{...}}` you must NOT touch):
```tsx
                    <label className="flex h-full cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700">
                      <input
                        type="checkbox"
                        checked={channel.id ? blockedIds.has(channel.id) : false}
                        onChange={() => toggleChannel(channel.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {channel.name}
                        </div>
                        {channel.group_name && (
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {channel.group_name}
                          </div>
                        )}
                      </div>
                      {channel.id && blockedIds.has(channel.id) && (
                        <Lock className="h-4 w-4 text-red-500" />
                      )}
                    </label>
```

New:
```tsx
                    <label className="flex h-full cursor-pointer items-center gap-3 rounded-lg border border-border p-3 hover:bg-surface-hover">
                      <input
                        type="checkbox"
                        checked={channel.id ? blockedIds.has(channel.id) : false}
                        onChange={() => toggleChannel(channel.id)}
                        className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-fluid-base text-text">{channel.name}</div>
                        {channel.group_name && (
                          <div className="text-fluid-sm text-text-muted">
                            {channel.group_name}
                          </div>
                        )}
                      </div>
                      {channel.id && blockedIds.has(channel.id) && (
                        <Lock className="h-4 w-4 text-red-500" />
                      )}
                    </label>
```

(The `text-red-500` lock icon on a blocked channel is semantic — kept as-is. The wrapping `<div style={{...}}>` immediately outside this `<label>` — with `position`, `top`, `left`, `width`, `height`, `transform`, `paddingBottom` — is the virtualizer's positioning and is completely untouched by this step.)

- [ ] **Step 4: Replace the footer (lines 228-247)**

Old:
```tsx
        <div className="flex items-center justify-between border-t border-gray-200 p-6 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {filteredChannels.length} channels shown
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              className="rounded-lg bg-gray-500 px-4 py-2 text-white hover:bg-gray-600 disabled:opacity-50"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
```

New:
```tsx
        <div className="flex items-center justify-between border-t border-border p-6">
          <div className="text-fluid-sm text-text-muted">
            {filteredChannels.length} channels shown
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              className="rounded-lg bg-surface-hover px-4 py-2 text-text hover:bg-border disabled:opacity-50"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded-lg bg-accent px-4 py-2 text-white hover:bg-accent-hover disabled:opacity-50"
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
```

- [ ] **Step 5: Type-check and visually verify**

```bash
npx tsc --noEmit
npm run tauri dev
```

Open Settings → Parental → Block Channels (or wherever this modal is triggered). Confirm the search, "Block/Unblock All", the virtualized channel list, and the footer all render with new tokens, and that scrolling the (potentially very long) channel list still performs well — the virtualizer logic is untouched, so this should behave identically to before. Close the app.

- [ ] **Step 6: Commit**

```bash
git add src/components/modals/ChannelBlockingModal.tsx
git commit -m "feat(tv-redesign-phase2): restyle ChannelBlockingModal with design tokens"
```

---

### Task 8: Restyle `Setup.tsx`

**Files:**
- Modify: `src/components/Setup.tsx`

**Interfaces:**
- Consumes: tokens from phase 1. No prop/behavior changes — same `SetupProps`, same dual standalone/modal-mode logic, same M3U/Xtream import flow untouched.

**Note:** this component renders in two modes — standalone (`onCancel` undefined, full-screen initial setup) and as a modal (`onCancel` provided, embedded inside `ProfileManager`'s own overlay). The root `className` is itself conditional on `onCancel` (see Step 1) — preserve that conditional exactly, only change what each branch renders.

- [ ] **Step 1: Replace the root container and card wrapper (lines 126-136)**

Old:
```tsx
    <div
      className={
        onCancel
          ? ''
          : 'flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4 dark:from-gray-900 dark:to-gray-800'
      }
    >
      <div
        className={`rounded-lg bg-white p-8 shadow-xl dark:bg-gray-800 ${onCancel ? 'w-full max-w-md' : 'w-full max-w-md'} relative`}
      >
```

New:
```tsx
    <div className={onCancel ? '' : 'flex min-h-screen items-center justify-center bg-bg p-4'}>
      <div
        className={`rounded-lg bg-surface p-8 shadow-xl ${onCancel ? 'w-full max-w-md' : 'w-full max-w-md'} relative`}
      >
```

(Gradient flattened to `bg-bg` per this plan's Design tokens section. The `${onCancel ? 'w-full max-w-md' : 'w-full max-w-md'}` ternary already produces the same class in both branches — that's pre-existing dead logic, not something this plan is scoped to clean up; leave it exactly as it is, only the surrounding static classes change.)

- [ ] **Step 2: Replace the modal-mode loading overlay and cancel button (lines 138-160)**

Old:
```tsx
        {isLoading && onCancel && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-sm dark:bg-gray-800/80">
            <div className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
              <p className="font-medium text-gray-700 dark:text-gray-300">Importing playlist...</p>
              {importProgress && totalLoaded > 0 && (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Loaded {totalLoaded.toLocaleString()} channels
                </p>
              )}
            </div>
          </div>
        )}

        {/* Cancel button if in modal mode */}
        {onCancel && (
          <button
            onClick={onCancel}
            className="absolute right-4 top-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        )}
```

New:
```tsx
        {isLoading && onCancel && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-surface/80 backdrop-blur-sm">
            <div className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-accent border-t-transparent"></div>
              <p className="text-fluid-base font-medium text-text-muted">Importing playlist...</p>
              {importProgress && totalLoaded > 0 && (
                <p className="mt-2 text-fluid-sm text-text-muted">
                  Loaded {totalLoaded.toLocaleString()} channels
                </p>
              )}
            </div>
          </div>
        )}

        {/* Cancel button if in modal mode */}
        {onCancel && (
          <button
            onClick={onCancel}
            className="absolute right-4 top-4 text-text-muted hover:text-text"
          >
            ✕
          </button>
        )}
```

- [ ] **Step 3: Replace the logo/title header (lines 162-174)**

Old:
```tsx
        <div className="mb-8 text-center">
          {/* Logo */}
          <div className="mb-4 flex justify-center">
            <img src={logoImage} alt="Better-IPTV Logo" className="h-24 w-24" />
          </div>

          <h1 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">
            {onCancel ? 'Add New Profile' : 'Better IPTV'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {onCancel ? 'Add a new IPTV playlist' : 'Add your IPTV playlist to get started'}
          </p>
        </div>
```

New:
```tsx
        <div className="mb-8 text-center">
          {/* Logo */}
          <div className="mb-4 flex justify-center">
            <img src={logoImage} alt="Better-IPTV Logo" className="h-24 w-24" />
          </div>

          <h1 className="mb-2 text-fluid-3xl font-bold text-text">
            {onCancel ? 'Add New Profile' : 'Better IPTV'}
          </h1>
          <p className="text-fluid-base text-text-muted">
            {onCancel ? 'Add a new IPTV playlist' : 'Add your IPTV playlist to get started'}
          </p>
        </div>
```

- [ ] **Step 4: Replace the tab switcher (lines 177-200)**

Old:
```tsx
        <div className="mb-6 flex border-b border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setImportType('m3u')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              importType === 'm3u'
                ? 'border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            M3U URL
          </button>
          <button
            type="button"
            onClick={() => setImportType('xtream')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              importType === 'xtream'
                ? 'border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Xtream Codes
          </button>
        </div>
```

New:
```tsx
        <div className="mb-6 flex border-b border-border">
          <button
            type="button"
            onClick={() => setImportType('m3u')}
            className={`flex-1 px-4 py-2 text-fluid-sm font-medium transition-colors ${
              importType === 'm3u'
                ? 'border-b-2 border-accent text-accent'
                : 'text-text-muted hover:text-text'
            }`}
          >
            M3U URL
          </button>
          <button
            type="button"
            onClick={() => setImportType('xtream')}
            className={`flex-1 px-4 py-2 text-fluid-sm font-medium transition-colors ${
              importType === 'xtream'
                ? 'border-b-2 border-accent text-accent'
                : 'text-text-muted hover:text-text'
            }`}
          >
            Xtream Codes
          </button>
        </div>
```

- [ ] **Step 5: Replace every form field's label and input classes (lines 202-294)**

Every label in this form uses the identical class string, and every text/password input uses an identical class string (5 labels, 5 inputs across the name field, M3U URL field, and the three Xtream fields). Use `replace_all` for each pair — they repeat verbatim.

Old (label, appears 5 times):
```tsx
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
```

New:
```tsx
              className="mb-1 block text-fluid-sm font-medium text-text-muted"
```

Old (input, appears 5 times):
```tsx
              className="w-full rounded-md border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
```

New:
```tsx
              className="w-full rounded-md border border-border bg-surface px-4 py-2 text-text focus:border-transparent focus:ring-2 focus:ring-accent"
```

- [ ] **Step 6: Replace the error banner and submit button (lines 290-306)**

Old:
```tsx
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add Playlist
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          Your playlist will be saved locally
        </div>
```

New:
```tsx
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-fluid-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full rounded-md bg-accent px-4 py-3 font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add Playlist
          </button>
        </form>

        <div className="mt-6 text-center text-fluid-xs text-text-muted">
          Your playlist will be saved locally
        </div>
```

(Error banner border/bg/text colors stay semantic red — only the font-size token changed.)

- [ ] **Step 7: Type-check and visually verify both modes**

```bash
npx tsc --noEmit
npm run tauri dev
```

If you have no playlists configured, you'll see standalone mode directly. Otherwise, open Settings → Profiles → "Create New Profile" to see modal mode. Confirm both the M3U and Xtream tabs, all form fields, and the loading/error states render correctly with the new tokens in both themes, and that both standalone and modal presentation still look correct (no accidental `bg-bg`-on-`bg-bg` invisible-card issue, given the modal mode's outer wrapper has an empty className and relies on `ProfileManager`'s own `bg-black/50` overlay). Close the app.

- [ ] **Step 8: Commit**

```bash
git add src/components/Setup.tsx
git commit -m "feat(tv-redesign-phase2): restyle Setup with design tokens, flatten gradient to bg-bg"
```

---

### Task 9: Restyle `App.tsx`'s loading state

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: tokens from phase 1. No changes to the `checkSetup` effect or any state — only the JSX in the `isCheckingSetup` branch changes.

- [ ] **Step 1: Replace the loading state JSX (lines 52-63, after Task 2 already added the `useTheme()` call above this)**

Old:
```tsx
  if (isCheckingSetup) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
            Loading playlist...
          </p>
        </div>
      </div>
    );
  }
```

New:
```tsx
  if (isCheckingSetup) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-accent border-t-transparent"></div>
          <p className="text-fluid-lg font-medium text-text-muted">Loading playlist...</p>
        </div>
      </div>
    );
  }
```

- [ ] **Step 2: Type-check and visually verify**

```bash
npx tsc --noEmit
npm run tauri dev
```

This loading state is brief (only shown while `checkSetup()` runs on app start) — the easiest way to see it is to add a temporary `await new Promise(r => setTimeout(r, 2000))` at the top of `checkSetup` in your local run, confirm it renders correctly in both themes, then remove the temporary delay before committing. Close the app.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(tv-redesign-phase2): restyle App loading state with design tokens, flatten gradient to bg-bg"
```

---

### Task 10: Restyle `ErrorBoundary.tsx`

**Files:**
- Modify: `src/components/ErrorBoundary.tsx`

**Interfaces:**
- Consumes: tokens from phase 1. No changes to any class logic (`ErrorBoundary`, `SectionErrorBoundary`, `withSectionErrorBoundary` all keep their exact exports/behavior) — only classNames change.

This file has two independent error UIs: the top-level fatal-error screen (`ErrorBoundary.render`) and the section-level compact/standard error UI (`SectionErrorBoundary.render`). Both were historically dark-only (rendered outside/before normal app chrome); this task converts both to tokens so they respect the (now-working) theme setting like everything else, since a themed app shouldn't have one screen that's permanently dark regardless of user preference.

- [ ] **Step 1: Replace the top-level fatal-error screen (lines 54-110)**

Old:
```tsx
      return (
        <div className="flex h-screen items-center justify-center bg-gray-900">
          <div className="mx-4 w-full max-w-md rounded-lg bg-gray-800 p-6 shadow-xl">
            <div className="text-center">
              <div className="mb-4">
                <svg
                  className="mx-auto h-16 w-16 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h2 className="mb-2 text-xl font-semibold text-white">Something went wrong</h2>
              <p className="mb-6 text-gray-400">
                An unexpected error occurred. Please try again or restart the application.
              </p>
              {this.state.error && (
                <details className="mb-6 text-left">
                  <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-400">
                    Error details
                  </summary>
                  <pre className="mt-2 max-h-40 overflow-auto rounded bg-gray-900 p-3 text-xs text-red-400">
                    {this.state.error.message}
                    {this.state.error.stack && (
                      <>
                        {'\n\n'}
                        {this.state.error.stack}
                      </>
                    )}
                  </pre>
                </details>
              )}
              <div className="flex justify-center gap-3">
                <button
                  onClick={this.handleRetry}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
                >
                  Try Again
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="rounded-lg bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-600"
                >
                  Reload App
                </button>
              </div>
            </div>
          </div>
        </div>
      );
```

New:
```tsx
      return (
        <div className="flex h-screen items-center justify-center bg-bg">
          <div className="mx-4 w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
            <div className="text-center">
              <div className="mb-4">
                <svg
                  className="mx-auto h-16 w-16 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h2 className="mb-2 text-fluid-xl font-semibold text-text">Something went wrong</h2>
              <p className="mb-6 text-fluid-base text-text-muted">
                An unexpected error occurred. Please try again or restart the application.
              </p>
              {this.state.error && (
                <details className="mb-6 text-left">
                  <summary className="cursor-pointer text-fluid-sm text-text-muted hover:text-text">
                    Error details
                  </summary>
                  <pre className="mt-2 max-h-40 overflow-auto rounded bg-bg p-3 text-fluid-xs text-red-400">
                    {this.state.error.message}
                    {this.state.error.stack && (
                      <>
                        {'\n\n'}
                        {this.state.error.stack}
                      </>
                    )}
                  </pre>
                </details>
              )}
              <div className="flex justify-center gap-3">
                <button
                  onClick={this.handleRetry}
                  className="rounded-lg bg-accent px-4 py-2 text-white transition-colors hover:bg-accent-hover"
                >
                  Try Again
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="rounded-lg bg-surface-hover px-4 py-2 text-text transition-colors hover:bg-border"
                >
                  Reload App
                </button>
              </div>
            </div>
          </div>
        </div>
      );
```

(The warning-triangle SVG's `text-red-500` and the error-stack `<pre>`'s `text-red-400` stay semantic red — this is an error screen, red for the actual error content is intentional, not generic chrome.)

- [ ] **Step 2: Replace the section-level compact error UI (lines 149-161)**

Old:
```tsx
        return (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-red-500/10 p-4 text-red-400">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm">Fel i {this.props.section}</span>
            <button
              onClick={this.handleRetry}
              className="ml-2 rounded bg-red-500/20 p-1 hover:bg-red-500/30"
              title="Försök igen"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        );
```

New:
```tsx
        return (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-red-500/10 p-4 text-red-400">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-fluid-sm">Fel i {this.props.section}</span>
            <button
              onClick={this.handleRetry}
              className="ml-2 rounded bg-red-500/20 p-1 hover:bg-red-500/30"
              title="Försök igen"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        );
```

(This compact variant is entirely semantic-red by design — a small inline error chip. Only the font-size token changed; nothing else in this block is generic chrome. The Swedish-language strings `"Fel i ..."`/`"Försök igen"` are pre-existing content, not in scope for this styling-only plan — do not translate or otherwise edit them.)

- [ ] **Step 3: Replace the section-level standard error UI (lines 165-193)**

Old:
```tsx
      return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-red-500/20 bg-red-500/5 p-8">
          <AlertTriangle className="mb-4 h-12 w-12 text-red-400" />
          <h3 className="mb-2 text-lg font-medium text-white">
            Något gick fel i {this.props.section}
          </h3>
          <p className="mb-4 text-sm text-gray-400">
            Ett fel uppstod. Du kan försöka igen eller ladda om sidan.
          </p>
          {this.state.error && (
            <details className="mb-4 w-full max-w-md text-left">
              <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-400">
                Tekniska detaljer
              </summary>
              <pre className="mt-2 max-h-32 overflow-auto rounded bg-gray-900 p-2 text-xs text-red-400">
                {this.state.error.message}
              </pre>
            </details>
          )}
          <div className="flex gap-2">
            <button
              onClick={this.handleRetry}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              <RefreshCw className="h-4 w-4" />
              Försök igen
            </button>
          </div>
        </div>
      );
```

New:
```tsx
      return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-red-500/20 bg-red-500/5 p-8">
          <AlertTriangle className="mb-4 h-12 w-12 text-red-400" />
          <h3 className="mb-2 text-fluid-lg font-medium text-text">
            Något gick fel i {this.props.section}
          </h3>
          <p className="mb-4 text-fluid-sm text-text-muted">
            Ett fel uppstod. Du kan försöka igen eller ladda om sidan.
          </p>
          {this.state.error && (
            <details className="mb-4 w-full max-w-md text-left">
              <summary className="cursor-pointer text-fluid-xs text-text-muted hover:text-text">
                Tekniska detaljer
              </summary>
              <pre className="mt-2 max-h-32 overflow-auto rounded bg-bg p-2 text-fluid-xs text-red-400">
                {this.state.error.message}
              </pre>
            </details>
          )}
          <div className="flex gap-2">
            <button
              onClick={this.handleRetry}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-fluid-sm text-white hover:bg-accent-hover"
            >
              <RefreshCw className="h-4 w-4" />
              Försök igen
            </button>
          </div>
        </div>
      );
```

- [ ] **Step 4: Type-check and verify**

```bash
npx tsc --noEmit
```

This component only renders on an actual JavaScript error, which is impractical to trigger live for a visual check — `tsc` passing and a careful read of the diff against the before/after blocks above is the verification for this task. (Full-suite validation in Task 13 covers the rest of the app; this file has no direct test coverage to run.)

- [ ] **Step 5: Commit**

```bash
git add src/components/ErrorBoundary.tsx
git commit -m "feat(tv-redesign-phase2): restyle ErrorBoundary with design tokens so error screens respect theme"
```

---

### Task 11: Restyle `LoadingScreen.tsx`

**Files:**
- Modify: `src/components/LoadingScreen.tsx`

**Interfaces:**
- Consumes: tokens from phase 1. No prop changes — same `LoadingScreenProps`.

**Design decision:** the cyan/purple/blue colors on the live/VOD/series counters and the three bouncing dots are intentional decorative category accents (not generic chrome, not the app's red accent) — kept exactly as-is. Only the gradient background and the plain white/gray text convert.

- [ ] **Step 1: Replace the background and message text (lines 30-39)**

Old:
```tsx
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Logo with pulse animation */}
      <div className="mb-8 animate-pulse">
        <img src={logoImage} alt="Better-IPTV Logo" className="h-64 w-64 drop-shadow-2xl" />
      </div>

      {/* Loading message */}
      <div className="text-center">
        <p className="mb-4 text-xl font-medium text-white">{message}</p>
```

New:
```tsx
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg">
      {/* Logo with pulse animation */}
      <div className="mb-8 animate-pulse">
        <img src={logoImage} alt="Better-IPTV Logo" className="h-64 w-64 drop-shadow-2xl" />
      </div>

      {/* Loading message */}
      <div className="text-center">
        <p className="mb-4 text-fluid-xl font-medium text-text">{message}</p>
```

- [ ] **Step 2: Replace the detail text sizes, keeping the category colors (lines 43-73)**

Old:
```tsx
        {showDetails && (
          <div className="space-y-2 text-gray-300">
            {details!.live_count! > 0 && (
              <p className="text-lg">
                <span className="font-semibold text-cyan-400">
                  {details!.live_count!.toLocaleString()}
                </span>{' '}
                live streams
              </p>
            )}
            {details!.vod_count! > 0 && (
              <p className="text-lg">
                <span className="font-semibold text-purple-400">
                  {details!.vod_count!.toLocaleString()}
                </span>{' '}
                VOD streams
              </p>
            )}
            {details!.series_count! > 0 && (
              <p className="text-lg">
                <span className="font-semibold text-blue-400">
                  {details!.series_count!.toLocaleString()}
                </span>{' '}
                series
              </p>
            )}
            {showProgress && (
              <p className="mt-4 text-xl font-bold text-white">
                Total: {progress!.toLocaleString()} channels
              </p>
            )}
          </div>
        )}
```

New:
```tsx
        {showDetails && (
          <div className="space-y-2 text-text-muted">
            {details!.live_count! > 0 && (
              <p className="text-fluid-lg">
                <span className="font-semibold text-cyan-400">
                  {details!.live_count!.toLocaleString()}
                </span>{' '}
                live streams
              </p>
            )}
            {details!.vod_count! > 0 && (
              <p className="text-fluid-lg">
                <span className="font-semibold text-purple-400">
                  {details!.vod_count!.toLocaleString()}
                </span>{' '}
                VOD streams
              </p>
            )}
            {details!.series_count! > 0 && (
              <p className="text-fluid-lg">
                <span className="font-semibold text-blue-400">
                  {details!.series_count!.toLocaleString()}
                </span>{' '}
                series
              </p>
            )}
            {showProgress && (
              <p className="mt-4 text-fluid-xl font-bold text-text">
                Total: {progress!.toLocaleString()} channels
              </p>
            )}
          </div>
        )}
```

(`text-cyan-400`, `text-purple-400`, `text-blue-400` are the intentional decorative per-category accents described above — kept exactly as-is, including `text-blue-400` specifically NOT converting to `text-accent` here, since in this one spot it means "series" as a category color, not "the generic accent color.")

- [ ] **Step 3: Leave the animated loading dots untouched**

Lines 77-83 (`bg-cyan-500`, `bg-blue-500`, `bg-purple-500` on the three bouncing dots) are the same decorative category-color triad — no change needed, do not edit this block.

- [ ] **Step 4: Type-check and visually verify**

```bash
npx tsc --noEmit
npm run tauri dev
```

Trigger this screen by importing a new playlist (Settings → Profiles → Create New Profile, or the initial setup flow) and watch it during the import. Confirm the background and plain text now use tokens while the cyan/purple/blue category accents are unchanged. Close the app.

- [ ] **Step 5: Commit**

```bash
git add src/components/LoadingScreen.tsx
git commit -m "feat(tv-redesign-phase2): restyle LoadingScreen chrome with design tokens, keep category accent colors"
```

---

### Task 12: Delete dead code and fix the one missed spot from phase 1

**Files:**
- Delete: `src/components/ChannelHeader.tsx`
- Modify: `src/components/settings/AboutTab.tsx:95`

**Interfaces:** none — `ChannelHeader` is confirmed unreferenced anywhere in `src/` (verified by the phase-2 scoping investigation via `grep -rn "ChannelHeader" src/`), and `AboutTab.tsx`'s public shape doesn't change.

- [ ] **Step 1: Confirm `ChannelHeader.tsx` is truly unused before deleting**

```bash
grep -rn "ChannelHeader" src/
```

Expected: the only match is the file's own definition (`src/components/ChannelHeader.tsx`) — no import anywhere else. `MainScreen.tsx` has its own inline header (restyled in phase 1) and never used this component.

- [ ] **Step 2: Delete the file**

```bash
git rm src/components/ChannelHeader.tsx
```

- [ ] **Step 3: Fix `AboutTab.tsx:95`'s partial conversion**

This is a leftover from phase 1: the GitHub Sponsors button's base classes were never converted (only its `dark:` variants were, in phase 1's final-review fix wave), so light mode currently shows a hardcoded near-black button.

Old:
```tsx
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-fluid-sm font-semibold text-white transition-colors hover:bg-gray-700 dark:bg-surface-hover dark:hover:bg-border"
```

New:
```tsx
          className="inline-flex items-center gap-2 rounded-lg bg-surface-hover px-4 py-2 text-fluid-sm font-semibold text-white transition-colors hover:bg-border"
```

(This makes the button fully theme-aware — no more hardcoded `bg-gray-900`, and the redundant `dark:` prefixes phase 1 already added become unnecessary once the base itself uses the token, so they're dropped. `text-white` is kept: both `bg-surface-hover` and `hover:bg-border` are dark enough in both themes for white text to stay legible here, unlike the light-mode-light `bg-surface-hover` case phase 1 hit elsewhere — verify this visually in Step 4 below, since it's the one judgment call in this task.)

- [ ] **Step 4: Type-check and visually verify**

```bash
npx tsc --noEmit
npm run tauri dev
```

Confirm the app still builds and runs with `ChannelHeader.tsx` gone (nothing should reference it, so this should be a no-op visually). Open Settings → About and confirm the GitHub Sponsors button is legible with proper contrast in both light and dark themes.

- [ ] **Step 5: Run the existing test suite to confirm no regression**

```bash
npm run test:run
```

Expected: all existing tests pass — `ChannelHeader.tsx` has no test file referencing it (confirm with `grep -rn "ChannelHeader" src/test/` if in doubt).

- [ ] **Step 6: Commit**

```bash
git add -A src/components/ChannelHeader.tsx src/components/settings/AboutTab.tsx
git commit -m "chore(tv-redesign-phase2): delete unused ChannelHeader, fix AboutTab GitHub Sponsors button light-mode contrast"
```

---

### Task 13: Full-suite validation and manual checklist (theme toggle + all restyled screens)

**Files:** none (validation only)

- [ ] **Step 1: Run the full vitest suite**

```bash
npm run test:run
```

Expected: all existing tests pass unchanged.

- [ ] **Step 2: Run a full type-check and production frontend build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both succeed with no errors.

- [ ] **Step 3: Run a final grep sweep for leftover old classes across every file this plan touched**

```bash
grep -rn "bg-gray-\|text-gray-\|border-gray-\|bg-blue-6\|text-blue-6\|border-blue-6\|focus:ring-blue-5\|focus:border-blue-5" \
  src/components/ProfileManager.tsx \
  src/components/modals/*.tsx \
  src/components/Setup.tsx \
  src/App.tsx \
  src/components/ErrorBoundary.tsx \
  src/components/LoadingScreen.tsx \
  src/components/settings/AboutTab.tsx
```

Expected: no matches, or only the documented semantic exceptions from this plan (red for errors/danger/destructive actions across every modal, green for the "New"/"Added" and "Activate" cases, the RefreshModal's blue "Updated" stat, and LoadingScreen's cyan/purple/blue category accents). Cross-check any surprise match against this plan's per-task "kept as-is" notes before treating it as a real gap.

- [ ] **Step 4: Confirm `ChannelHeader.tsx` is gone and nothing references it**

```bash
ls src/components/ChannelHeader.tsx 2>&1 | grep -q "No such file" && echo "deleted, good" || echo "STILL EXISTS — investigate"
grep -rn "ChannelHeader" src/ || echo "no references, good"
```

- [ ] **Step 5: Manual theme-toggle validation checklist (live, via `npm run tauri dev`)**

```bash
npm run tauri dev
```

With the app open:

- [ ] Settings → General → Appearance: click "Light" — the entire app (not just the picker) switches to light colors immediately, including the currently-open Settings modal itself
- [ ] Click "Dark" — switches back immediately
- [ ] Click "System" — matches your current OS/desktop theme
- [ ] Pick a theme different from the current saved one, then close Settings via the X (not Save) — the app's visible theme reverts to the last **saved** value
- [ ] Reopen Settings — the picker shows the last saved value, not whatever you clicked-but-didn't-save
- [ ] Pick a theme and click "Save Changes" — reopen Settings, both the picker and the live app reflect the saved choice, and it persists across restarting `tauri dev`

- [ ] **Step 6: Manual visual checklist for every restyled screen, in BOTH light and dark theme**

- [ ] Settings → Profiles: profile list, active/inactive card styling, rename flow, delete-last-profile warning modal
- [ ] Settings → Profiles → Create New Profile: Setup modal, both M3U and Xtream tabs
- [ ] Initial setup screen (standalone `Setup`, if you have no playlists — or temporarily rename your SQLite db to test this): logo, tabs, form, error state
- [ ] App startup loading state (brief — see Task 9's note on how to slow it down for inspection if needed)
- [ ] Playlist import loading screen (`LoadingScreen`): background, counters (cyan/purple/blue kept), bouncing dots
- [ ] Settings → Parental → Set/Change/Verify PIN modal, all three modes
- [ ] Settings → Parental → Block Channels modal: search, Block/Unblock All, virtualized list, footer
- [ ] Settings → General → Refresh Playlist: in-progress, completed (green/blue/red stats unchanged), and error states if triggerable
- [ ] Any confirmation/error modal (e.g. Settings → Parental → Reset PIN for the danger-variant `ConfirmationModal`; an invalid rename for `ErrorModal`)
- [ ] Settings → About: GitHub Sponsors button legible in both themes now

- [ ] **Step 7: Report back to the user for approval**

Do not build the Tauri binary or touch the production install yet — same deferred-cutover rule as phase 1. Stop here and hand control back for review.

---

## Self-review notes

- **Spec coverage:** theme toggle wiring → Task 2 (new hook + App.tsx + Settings.tsx + index.html); every file the phase-2 investigation found with legacy classes → Tasks 3–11 (ProfileManager, the 5 modals, Setup, App's loading state, ErrorBoundary, LoadingScreen); dead code and the one phase-1 miss → Task 12; full validation including a live theme-toggle checklist → Task 13.
- **Placeholder scan:** every task has concrete before/after code or exact shell commands; no "TBD" or "similar to Task N" shortcuts — Task 5's repeated PIN-input fields and Task 8's repeated form-field labels/inputs use `replace_all` on verbatim-identical strings (same pattern phase 1 used successfully in its own Task 10), not hand-waved repetition.
- **Type consistency:** `Theme` type, `applyTheme(theme: Theme): void`, and `useTheme(): void` signatures are defined once in Task 2 and used identically in every task that references them (only Task 2 itself touches `useTheme.ts`/`App.tsx`/`Settings.tsx`); no other task's props or exported interfaces change.
- **Semantic-color exceptions are enumerated per task**, not left implicit — every "kept as-is" color (red for errors/danger/destructive, green for success/added/activate, the RefreshModal blue "updated" stat, LoadingScreen's cyan/purple/blue category accents) is called out explicitly in its task's steps, so a reviewer can check completeness (a leftover `gray-`/generic-`blue-` class is a miss; a documented semantic color surviving is correct) the same way phase 1's final review did.
