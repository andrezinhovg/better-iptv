# TV-Friendly UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Better IPTV's default visual style with a Netflix-style dark theme — fluid, larger typography and cover-forward cards — readable from a couch on a 60" TV, without touching any business logic, hooks, stores, or the Rust backend.

**Architecture:** Introduce a small CSS-variable-backed design-token layer (colors + fluid `clamp()` typography) in `tailwind.config.js` / `src/index.css`, then mechanically restyle each presentation component to consume the new tokens instead of hardcoded Tailwind gray/blue classes and fixed `dark:` variants. All work happens in an isolated git worktree so the currently-shipping build is never at risk.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind CSS (existing stack, no new dependencies).

## Global Constraints

- Frontend-only (`src/`, `tailwind.config.js`, `src/index.css`). No changes under `src-tauri/`.
- No changes to hook *logic*, Zustand stores (`src/stores/player-store.ts`), or business logic. The one narrow exception: `src/hooks/useResponsiveGrid.ts` gets its numeric `BREAKPOINTS` tuning constants adjusted (not its logic) so the grid virtualizer's row-height math matches the new, larger card size — this is called out explicitly in Task 8.
- Existing vitest suite (`src/test/`) must keep passing unmodified — it covers hooks/stores/lib, none of which change behavior here.
- All work happens in the git worktree `~/Projects/better-iptv-tv-redesign` on branch `feature/tv-redesign`, branched from `main` in `~/Projects/better-iptv` (which already has the 2026-07-29/30 parser/CSP/SQL fixes). `~/Projects/better-iptv` itself is never modified by this plan.
- No production Tauri *build* (`cargo build --release`) is required to complete this plan — validate visually with `npm run tauri dev` (runs the real Rust IPC backend against the existing dev binary, so screens with real data render correctly; plain `npm run dev` only proves Tailwind/TypeScript compile and is used for that narrower purpose in Task 2). Building the release Tauri binary and cutting over the production install (`/opt/better-iptv-bin/usr/bin/better-ip-tv`) is a deliberate follow-up step *after* the user approves the look live on the TV; it is not part of this plan.
- MPV embedding is explicitly out of scope (dropped during brainstorming — Wayland/`--wid` reliability risk).

---

## Design tokens (reference for every task below)

New CSS variables added in Task 2, consumed via Tailwind color aliases. Every task after Task 2 uses this exact substitution table when restyling a file:

| Old class(es) | New class |
|---|---|
| `bg-gray-50` (light bg), `dark:bg-gray-900` | `bg-bg` (no `dark:` needed — the variable itself swaps) |
| `bg-white`, `dark:bg-gray-800` (card/panel surface) | `bg-surface` |
| `bg-gray-100`, `bg-gray-200`, `bg-gray-700`, `dark:bg-gray-700` (hover/secondary surface) | `bg-surface-hover` |
| `text-gray-900`, `dark:text-white` | `text-text` |
| `text-gray-400/500/600/700`, `dark:text-gray-300/400` | `text-text-muted` |
| `border-gray-200/300`, `dark:border-gray-600/700` | `border-border` |
| `bg-blue-600`, `hover:bg-blue-700` | `bg-accent`, `hover:bg-accent-hover` |
| `text-blue-600`, `dark:text-blue-400` | `text-accent` |
| `border-blue-600`, `dark:border-blue-400` | `border-accent` |
| `focus:ring-blue-500` | `focus:ring-accent` |
| `text-xs` | `text-fluid-xs` |
| `text-sm` | `text-fluid-sm` |
| `text-base` (implicit/default) | `text-fluid-base` |
| `text-lg` | `text-fluid-lg` |
| `text-xl` | `text-fluid-xl` |
| `text-2xl` | `text-fluid-2xl` |
| `text-3xl` | `text-fluid-3xl` |

Spacing/density gets a flat bump in each task (no new token needed — just larger existing Tailwind values): `p-3`→`p-5`, `p-4`→`p-6`, `gap-2`→`gap-3`, `gap-4`→`gap-6`, `rounded-lg`→`rounded-xl`, `rounded-md`→`rounded-lg`.

---

### Task 1: Create the isolated git worktree

**Files:** none (repo/worktree setup only)

- [ ] **Step 1: Verify the main repo is clean and on `main`**

```bash
cd ~/Projects/better-iptv
git status --short
git branch --show-current
```

Expected: no uncommitted changes, current branch `main`.

- [ ] **Step 2: Create the worktree on a new branch**

```bash
git worktree add -b feature/tv-redesign ~/Projects/better-iptv-tv-redesign main
```

Expected: new directory `~/Projects/better-iptv-tv-redesign` created, checked out on branch `feature/tv-redesign`.

- [ ] **Step 3: Install frontend dependencies in the new worktree**

```bash
cd ~/Projects/better-iptv-tv-redesign
npm install
```

Expected: completes without error (this worktree needs its own `node_modules`; it is not shared with `~/Projects/better-iptv`).

- [ ] **Step 4: Confirm the dev server runs**

```bash
npm run tauri dev
```

Expected: the app window opens showing the current (unmodified) UI, connected to the same local SQLite data (`~/.local/share/com.m0s.better-ip-tv/better-ip-tv.db`) as the production install. Stop it (Ctrl+C) once confirmed — subsequent tasks restart it as needed.

> All remaining tasks operate inside `~/Projects/better-iptv-tv-redesign`.

---

### Task 2: Design tokens — Tailwind config + CSS variables

**Files:**
- Modify: `src/index.css`
- Modify: `tailwind.config.js`

**Interfaces:**
- Produces: Tailwind utility classes `bg-bg`, `bg-surface`, `bg-surface-hover`, `text-text`, `text-text-muted`, `border-border`, `bg-accent`, `bg-accent-hover`, `text-accent`, `border-accent`, `focus:ring-accent`, and font sizes `text-fluid-xs` through `text-fluid-3xl`, consumed by every later task.

- [ ] **Step 1: Add CSS variables to `src/index.css`**

Replace the full file content:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-bg: 249 250 251;
  --color-surface: 255 255 255;
  --color-surface-hover: 243 244 246;
  --color-text: 17 24 39;
  --color-text-muted: 75 85 99;
  --color-border: 229 231 235;
  --color-accent: 220 38 38;
  --color-accent-hover: 185 28 28;
}

.dark {
  --color-bg: 3 7 18;
  --color-surface: 17 24 39;
  --color-surface-hover: 31 41 55;
  --color-text: 249 250 251;
  --color-text-muted: 156 163 175;
  --color-border: 55 65 81;
  --color-accent: 239 68 68;
  --color-accent-hover: 248 113 113;
}
```

(Light values reuse Tailwind's own gray-50/100/200/600/900 and red-600/700 scale; dark values use gray-950/900/800/700/400/50 and red-500/400 — no invented colors, and the dark accent is Tailwind's red-500, deliberately not Netflix's exact brand hex, to avoid trademark collision while keeping the "cinematic red accent" feel.)

- [ ] **Step 2: Extend `tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-hover': 'rgb(var(--color-surface-hover) / <alpha-value>)',
        text: 'rgb(var(--color-text) / <alpha-value>)',
        'text-muted': 'rgb(var(--color-text-muted) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          hover: 'rgb(var(--color-accent-hover) / <alpha-value>)',
        },
      },
      fontSize: {
        'fluid-xs': 'clamp(0.75rem, 0.65rem + 0.3vw, 0.9rem)',
        'fluid-sm': 'clamp(0.875rem, 0.75rem + 0.4vw, 1.125rem)',
        'fluid-base': 'clamp(1rem, 0.85rem + 0.5vw, 1.375rem)',
        'fluid-lg': 'clamp(1.125rem, 0.95rem + 0.65vw, 1.625rem)',
        'fluid-xl': 'clamp(1.375rem, 1.1rem + 1vw, 2rem)',
        'fluid-2xl': 'clamp(1.75rem, 1.3rem + 1.5vw, 2.75rem)',
        'fluid-3xl': 'clamp(2.25rem, 1.6rem + 2.25vw, 3.75rem)',
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 3: Verify the build picks up the new config**

```bash
npm run dev
```

Expected: dev server starts without Tailwind/PostCSS errors. Stop it (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add src/index.css tailwind.config.js
git commit -m "feat(tv-redesign): add design token layer (colors, fluid typography)"
```

---

### Task 3: Restyle `ChannelCard.tsx`

**Files:**
- Modify: `src/components/ChannelCard.tsx`

**Interfaces:**
- Consumes: tokens from Task 2.
- No prop/signature changes — same `ChannelCardProps` interface, same behavior.

- [ ] **Step 1: Swap the outer card container and logo section (lines 50–68)**

Old:
```tsx
    <div
      className="relative flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
      style={{ height: `${cardHeight}px` }}
    >
      {/* Logo/Image section */}
      <div className="group relative flex-shrink-0 bg-gray-900">
        {channel.logo ? (
          <div
            className="flex w-full items-center justify-center bg-gray-900 p-2"
            style={{ height: `${imageHeight}px` }}
          >
            <img
              src={channel.logo}
              alt={channel.name}
              loading="lazy"
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ) : (
```

New:
```tsx
    <div
      className="relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-shadow hover:shadow-lg"
      style={{ height: `${cardHeight}px` }}
    >
      {/* Logo/Image section */}
      <div className="group relative flex-shrink-0 bg-bg">
        {channel.logo ? (
          <div
            className="flex w-full items-center justify-center bg-bg"
            style={{ height: `${imageHeight}px` }}
          >
            <img
              src={channel.logo}
              alt={channel.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
```

(Note: dropped the `p-2` padding and switched `object-contain` → `object-cover` so the cover image fills the card — the "capa em destaque" the spec calls for — instead of a small centered logo.)

- [ ] **Step 2: Swap the content section text (lines 103–115)**

Old:
```tsx
      <div className={`${isLarge ? 'p-4' : isSmall ? 'p-2' : 'p-3'} flex min-h-0 flex-1 flex-col`}>
        <h3
          className={`truncate font-medium text-gray-900 dark:text-white ${isLarge ? 'text-base' : 'text-sm'}`}
        >
          {channel.name}
        </h3>
        {channel.group_name && (
          <p
            className={`mt-0.5 truncate text-gray-500 dark:text-gray-400 ${isSmall ? 'text-[10px]' : 'text-xs'}`}
          >
            {channel.group_name}
          </p>
        )}
        {currentProgram && channel.content_type === 'live' && (
          <p
            className={`mt-0.5 truncate text-blue-600 dark:text-blue-400 ${isSmall ? 'text-[10px]' : 'text-xs'}`}
            title={currentProgram}
          >
            📺 {currentProgram}
          </p>
        )}
```

New:
```tsx
      <div className={`${isLarge ? 'p-6' : isSmall ? 'p-3' : 'p-5'} flex min-h-0 flex-1 flex-col`}>
        <h3
          className={`truncate font-medium text-text ${isLarge ? 'text-fluid-lg' : 'text-fluid-base'}`}
        >
          {channel.name}
        </h3>
        {channel.group_name && (
          <p className="mt-0.5 truncate text-fluid-sm text-text-muted">
            {channel.group_name}
          </p>
        )}
        {currentProgram && channel.content_type === 'live' && (
          <p
            className="mt-0.5 truncate text-fluid-sm text-accent"
            title={currentProgram}
          >
            📺 {currentProgram}
          </p>
        )}
```

- [ ] **Step 3: Swap the action button (lines 127–137)**

Old:
```tsx
        <button
          onClick={() => onPlay(channel)}
          className={`flex w-full items-center justify-center gap-2 rounded-md font-medium transition-colors ${
            isLarge ? 'mt-3 px-4 py-2.5' : isSmall ? 'mt-2 px-3 py-1.5 text-sm' : 'mt-2 px-4 py-2'
          } ${
            isPlaying
              ? 'bg-red-600 text-white hover:bg-red-700'
              : channel.content_type === 'series'
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
```

New:
```tsx
        <button
          onClick={() => onPlay(channel)}
          className={`flex w-full items-center justify-center gap-2 rounded-lg font-medium text-fluid-sm transition-colors ${
            isLarge ? 'mt-4 px-5 py-3' : isSmall ? 'mt-3 px-4 py-2' : 'mt-3 px-5 py-2.5'
          } ${
            isPlaying
              ? 'bg-red-600 text-white hover:bg-red-700'
              : channel.content_type === 'series'
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-accent text-white hover:bg-accent-hover'
          }`}
        >
```

(Kept `bg-red-600`/`bg-purple-600` as-is — those are semantic state colors, "stop" and "series," not the generic accent, so they're intentionally left out of the token substitution.)

- [ ] **Step 4: Type-check and visually verify**

```bash
npx tsc --noEmit
npm run tauri dev
```

Confirm channel cards render with the new colors/fonts (real data, since `tauri dev` runs the actual Rust IPC backend) and no console errors. Close the app window.

- [ ] **Step 5: Commit**

```bash
git add src/components/ChannelCard.tsx
git commit -m "feat(tv-redesign): restyle ChannelCard with design tokens and cover-forward image"
```

---

### Task 4: Restyle `NowPlayingBar.tsx`

**Files:**
- Modify: `src/components/NowPlayingBar.tsx`

**Interfaces:**
- Consumes: tokens from Task 2. No prop changes.

- [ ] **Step 1: Replace the full JSX body**

Old (lines 31–69):
```tsx
  return (
    <div className="bg-blue-600 p-4 text-white">
      <div className="mx-auto flex items-center justify-between px-2">
        <div className="flex items-center gap-4">
          {channel.logo && (
            <div className="flex h-12 w-12 items-center justify-center rounded bg-gray-900 p-1">
              <img
                src={channel.logo}
                alt={channel.name}
                className="max-h-full max-w-full object-contain"
                loading="lazy"
              />
            </div>
          )}
          <div>
            <p className="font-medium">{channel.name}</p>
            <p className="text-sm text-blue-100">{channel.group_name || 'Live TV'}</p>
            {currentProgram && (
              <p className="mt-1 text-sm text-blue-200">
                <span className="font-medium">Now showing:</span> {currentProgram}
              </p>
            )}
            {nextProgram && (
              <p className="mt-0.5 text-xs text-blue-200">
                <span className="font-medium">Next up:</span> {nextProgram}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onStop}
          className="rounded-lg bg-white/20 p-2 transition-colors hover:bg-white/30"
          aria-label="Stop playback"
        >
          <Square className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
```

New:
```tsx
  return (
    <div className="bg-accent p-6 text-white">
      <div className="mx-auto flex items-center justify-between px-2">
        <div className="flex items-center gap-4">
          {channel.logo && (
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-black/20">
              <img
                src={channel.logo}
                alt={channel.name}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          )}
          <div>
            <p className="text-fluid-lg font-medium">{channel.name}</p>
            <p className="text-fluid-sm text-white/80">{channel.group_name || 'Live TV'}</p>
            {currentProgram && (
              <p className="mt-1 text-fluid-sm text-white/90">
                <span className="font-medium">Now showing:</span> {currentProgram}
              </p>
            )}
            {nextProgram && (
              <p className="mt-0.5 text-fluid-xs text-white/70">
                <span className="font-medium">Next up:</span> {nextProgram}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onStop}
          className="rounded-lg bg-white/20 p-3 transition-colors hover:bg-white/30"
          aria-label="Stop playback"
        >
          <Square className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
```

- [ ] **Step 2: Type-check and visually verify**

```bash
npx tsc --noEmit
npm run tauri dev
```

Play a channel and confirm the now-playing bar shows the new accent color, larger cover thumbnail, and larger text. Close the app window.

- [ ] **Step 3: Commit**

```bash
git add src/components/NowPlayingBar.tsx
git commit -m "feat(tv-redesign): restyle NowPlayingBar with design tokens"
```

---

### Task 5: Restyle `CategoryBar.tsx` and `ContentTypeTabs.tsx`

**Files:**
- Modify: `src/components/CategoryBar.tsx`
- Modify: `src/components/ContentTypeTabs.tsx`

**Interfaces:**
- Consumes: tokens from Task 2. No prop/behavior changes to either component.

- [ ] **Step 1: Replace `CategoryBar.tsx`'s JSX (lines 16–54)**

Old:
```tsx
  return (
    <div
      className="scrollbar-hide flex gap-2 overflow-x-auto bg-gray-800/50 px-4 py-3 pb-6"
      role="tablist"
      aria-label="Channel categories"
    >
      {/* "All" chip - shows all channels in current content type */}
      <button
        onClick={() => setCategoryFilter(null)}
        role="tab"
        aria-selected={categoryFilter === null}
        className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
          categoryFilter === null
            ? 'bg-blue-600 text-white'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        } `}
      >
        All
      </button>

      {/* Category chips from provider */}
      {categories.map((category) => (
        <button
          key={category}
          onClick={() => setCategoryFilter(category)}
          role="tab"
          aria-selected={categoryFilter === category}
          className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
            categoryFilter === category
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          } `}
        >
          {category}
        </button>
      ))}
    </div>
  );
```

New:
```tsx
  return (
    <div
      className="scrollbar-hide flex gap-3 overflow-x-auto bg-bg px-6 py-4 pb-8"
      role="tablist"
      aria-label="Channel categories"
    >
      {/* "All" chip - shows all channels in current content type */}
      <button
        onClick={() => setCategoryFilter(null)}
        role="tab"
        aria-selected={categoryFilter === null}
        className={`shrink-0 rounded-full px-4 py-2 text-fluid-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg ${
          categoryFilter === null
            ? 'bg-accent text-white'
            : 'bg-surface-hover text-text-muted hover:bg-surface'
        } `}
      >
        All
      </button>

      {/* Category chips from provider */}
      {categories.map((category) => (
        <button
          key={category}
          onClick={() => setCategoryFilter(category)}
          role="tab"
          aria-selected={categoryFilter === category}
          className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-fluid-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg ${
            categoryFilter === category
              ? 'bg-accent text-white'
              : 'bg-surface-hover text-text-muted hover:bg-surface'
          } `}
        >
          {category}
        </button>
      ))}
    </div>
  );
```

- [ ] **Step 2: Replace `ContentTypeTabs.tsx`'s JSX (lines 47–72)**

Old:
```tsx
  return (
    <div className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="mx-auto px-6">
        <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Content type filter">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              role="tab"
              aria-selected={activeFilter === tab.value}
              aria-controls="channel-list"
              onClick={() => onFilterChange(tab.value)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 font-medium transition-colors ${
                activeFilter === tab.value
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
```

New:
```tsx
  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto px-6">
        <div className="flex gap-3 overflow-x-auto" role="tablist" aria-label="Content type filter">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              role="tab"
              aria-selected={activeFilter === tab.value}
              aria-controls="channel-list"
              onClick={() => onFilterChange(tab.value)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-5 py-4 text-fluid-base font-medium transition-colors ${
                activeFilter === tab.value
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
```

- [ ] **Step 3: Type-check and visually verify**

```bash
npx tsc --noEmit
npm run tauri dev
```

Confirm category chips and content-type tabs render with the new tokens, and switching tabs/categories still filters correctly (behavior untouched — only classes changed). Close the app window.

- [ ] **Step 4: Commit**

```bash
git add src/components/CategoryBar.tsx src/components/ContentTypeTabs.tsx
git commit -m "feat(tv-redesign): restyle CategoryBar and ContentTypeTabs with design tokens"
```

---

### Task 6: Restyle `MainScreen.tsx` header/shell

**Files:**
- Modify: `src/components/MainScreen.tsx:271-309` (header + grid container wrapper only — the virtualization logic at lines 316-365 is untouched except the `gap-4` → `gap-6` class noted below)

**Interfaces:**
- Consumes: tokens from Task 2. No changes to any hook call, state, or the virtualizer setup.

- [ ] **Step 1: Replace the header block (lines 271–290)**

Old:
```tsx
  return (
    <div className="flex h-screen flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto flex items-center justify-between px-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Better IPTV</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {channels.length} channels
            </span>
            <button
              onClick={() => setShowSettings(true)}
              className="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Settings"
            >
              <SettingsIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        </div>
      </div>
```

New:
```tsx
  return (
    <div className="flex h-screen flex-col bg-bg">
      {/* Header */}
      <div className="border-b border-border bg-surface p-6">
        <div className="mx-auto flex items-center justify-between px-2">
          <h1 className="text-fluid-2xl font-bold text-text">Better IPTV</h1>
          <div className="flex items-center gap-6">
            <span className="text-fluid-sm text-text-muted">
              {channels.length} channels
            </span>
            <button
              onClick={() => setShowSettings(true)}
              className="rounded-lg p-3 transition-colors hover:bg-surface-hover"
              title="Settings"
            >
              <SettingsIcon className="h-6 w-6 text-text-muted" />
            </button>
          </div>
        </div>
      </div>
```

- [ ] **Step 2: Update the grid container and empty-state text (lines 302–315)**

Old:
```tsx
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto"
        id="channel-list"
        role="tabpanel"
        aria-label="Channel list"
      >
        <div className="mx-auto p-4">
          {filteredChannels.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-gray-500 dark:text-gray-400">
                {searchQuery ? 'No channels found' : 'No channels available'}
              </p>
            </div>
          ) : (
```

New:
```tsx
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto"
        id="channel-list"
        role="tabpanel"
        aria-label="Channel list"
      >
        <div className="mx-auto p-6">
          {filteredChannels.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-fluid-base text-text-muted">
                {searchQuery ? 'No channels found' : 'No channels available'}
              </p>
            </div>
          ) : (
```

- [ ] **Step 3: Widen the grid gap (line 340)**

Old:
```tsx
                    <div className={`grid ${getGridClasses(columns)} gap-4`}>
```

New:
```tsx
                    <div className={`grid ${getGridClasses(columns)} gap-6`}>
```

> This gap change must land together with Task 8's `useResponsiveGrid.ts` update — both affect the row-height math the virtualizer relies on.

- [ ] **Step 4: Type-check and visually verify**

```bash
npx tsc --noEmit
npm run tauri dev
```

Confirm the header, empty state, and grid spacing use the new tokens, and the channel grid still scrolls smoothly (virtualization untouched). Close the app window.

- [ ] **Step 5: Commit**

```bash
git add src/components/MainScreen.tsx
git commit -m "feat(tv-redesign): restyle MainScreen header and grid shell with design tokens"
```

---

### Task 7: Restyle `SeriesView.tsx`

**Files:**
- Modify: `src/components/SeriesView.tsx`

**Interfaces:**
- Consumes: tokens from Task 2. No changes to data loading, state, or `EpisodeCard` props.

- [ ] **Step 1: Replace the loading and error states (lines 62–93)**

Old:
```tsx
  if (isLoading) {
    return (
      <div className="flex h-screen flex-col bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
            <p className="font-medium text-gray-700 dark:text-gray-300">Loading series...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !currentSeries) {
    return (
      <div className="flex h-screen flex-col bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="mb-4 font-medium text-red-600 dark:text-red-400">
              {error || 'Failed to load series'}
            </p>
            <button
              onClick={onBack}
              className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }
```

New:
```tsx
  if (isLoading) {
    return (
      <div className="flex h-screen flex-col bg-bg">
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-accent border-t-transparent"></div>
            <p className="text-fluid-base font-medium text-text-muted">Loading series...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !currentSeries) {
    return (
      <div className="flex h-screen flex-col bg-bg">
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="mb-4 text-fluid-base font-medium text-red-600 dark:text-red-400">
              {error || 'Failed to load series'}
            </p>
            <button
              onClick={onBack}
              className="rounded-lg bg-accent px-5 py-2.5 text-white hover:bg-accent-hover"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }
```

(Kept `text-red-600 dark:text-red-400` for the error message — semantic error color, not the accent.)

- [ ] **Step 2: Replace the header block (lines 97–134)**

Old:
```tsx
  return (
    <div className="flex h-screen flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto max-w-7xl">
          <button
            onClick={onBack}
            className="mb-4 flex items-center gap-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <ChevronLeft className="h-5 w-5" />
            Back to Series List
          </button>
          <div className="flex gap-6">
            {currentSeries.info.cover && (
              <img
                src={currentSeries.info.cover}
                alt={currentSeries.info.name}
                className="h-48 w-32 rounded-lg object-cover"
              />
            )}
            <div className="flex-1">
              <h1 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">
                {currentSeries.info.name}
              </h1>
              {currentSeries.info.genre && (
                <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                  {currentSeries.info.genre}
                </p>
              )}
              {currentSeries.info.plot && (
                <p className="line-clamp-3 text-gray-700 dark:text-gray-300">
                  {currentSeries.info.plot}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
```

New:
```tsx
  return (
    <div className="flex h-screen flex-col bg-bg">
      {/* Header */}
      <div className="border-b border-border bg-surface p-6">
        <div className="mx-auto max-w-7xl">
          <button
            onClick={onBack}
            className="mb-6 flex items-center gap-2 text-fluid-sm text-accent hover:text-accent-hover"
          >
            <ChevronLeft className="h-5 w-5" />
            Back to Series List
          </button>
          <div className="flex gap-8">
            {currentSeries.info.cover && (
              <img
                src={currentSeries.info.cover}
                alt={currentSeries.info.name}
                className="h-72 w-48 rounded-xl object-cover shadow-lg"
              />
            )}
            <div className="flex-1">
              <h1 className="mb-3 text-fluid-3xl font-bold text-text">
                {currentSeries.info.name}
              </h1>
              {currentSeries.info.genre && (
                <p className="mb-3 text-fluid-sm text-text-muted">
                  {currentSeries.info.genre}
                </p>
              )}
              {currentSeries.info.plot && (
                <p className="line-clamp-3 text-fluid-base text-text-muted">
                  {currentSeries.info.plot}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
```

- [ ] **Step 3: Replace the season selector (lines 136–155)**

Old:
```tsx
      {/* Season Selector */}
      <div className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex gap-2 overflow-x-auto py-4">
            {currentSeries.seasons.map((season) => (
              <button
                key={season.id}
                onClick={() => setSelectedSeason(season.season_number)}
                className={`whitespace-nowrap rounded-md px-4 py-2 font-medium transition-colors ${
                  selectedSeason === season.season_number
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600'
                }`}
              >
                {season.name} ({season.episode_count})
              </button>
            ))}
          </div>
        </div>
      </div>
```

New:
```tsx
      {/* Season Selector */}
      <div className="border-b border-border bg-surface">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex gap-3 overflow-x-auto py-5">
            {currentSeries.seasons.map((season) => (
              <button
                key={season.id}
                onClick={() => setSelectedSeason(season.season_number)}
                className={`whitespace-nowrap rounded-lg px-5 py-2.5 text-fluid-sm font-medium transition-colors ${
                  selectedSeason === season.season_number
                    ? 'bg-accent text-white'
                    : 'bg-surface-hover text-text hover:bg-border'
                }`}
              >
                {season.name} ({season.episode_count})
              </button>
            ))}
          </div>
        </div>
      </div>
```

- [ ] **Step 4: Replace the episode list wrapper and empty state (lines 157–166)**

Old:
```tsx
      {/* Episode List */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-4">
          {selectedSeasonEpisodes.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-gray-500 dark:text-gray-400">
                No episodes available for this season
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
```

New:
```tsx
      {/* Episode List */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-6">
          {selectedSeasonEpisodes.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-fluid-base text-text-muted">
                No episodes available for this season
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
```

- [ ] **Step 5: Replace the `EpisodeCard` component (lines 207–245)**

Old:
```tsx
function EpisodeCard({ episode, onPlay }: EpisodeCardProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="relative bg-gray-900">
        {episode.info.movie_image ? (
          <img
            src={episode.info.movie_image}
            alt={episode.title}
            className="h-48 w-full object-cover"
          />
        ) : (
          <div className="flex h-48 w-full items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
            <span className="text-4xl font-bold text-white">E{episode.episode_num}</span>
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="mb-1 line-clamp-2 font-medium text-gray-900 dark:text-white">
          Episode {episode.episode_num}
        </h3>
        <p className="mb-2 line-clamp-1 text-sm text-gray-700 dark:text-gray-300">
          {episode.title}
        </p>
        {episode.info.plot && (
          <p className="mb-3 line-clamp-2 text-xs text-gray-600 dark:text-gray-400">
            {episode.info.plot}
          </p>
        )}
        <button
          onClick={onPlay}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Play className="h-4 w-4" />
          Play
        </button>
      </div>
    </div>
  );
}
```

New:
```tsx
function EpisodeCard({ episode, onPlay }: EpisodeCardProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-shadow hover:shadow-lg">
      <div className="relative bg-bg">
        {episode.info.movie_image ? (
          <img
            src={episode.info.movie_image}
            alt={episode.title}
            className="h-56 w-full object-cover"
          />
        ) : (
          <div className="flex h-56 w-full items-center justify-center bg-gradient-to-br from-accent to-purple-600">
            <span className="text-fluid-2xl font-bold text-white">E{episode.episode_num}</span>
          </div>
        )}
      </div>
      <div className="p-5">
        <h3 className="mb-1 line-clamp-2 text-fluid-base font-medium text-text">
          Episode {episode.episode_num}
        </h3>
        <p className="mb-2 line-clamp-1 text-fluid-sm text-text-muted">
          {episode.title}
        </p>
        {episode.info.plot && (
          <p className="mb-3 line-clamp-2 text-fluid-xs text-text-muted">
            {episode.info.plot}
          </p>
        )}
        <button
          onClick={onPlay}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-fluid-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Play className="h-4 w-4" />
          Play
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Type-check and visually verify**

```bash
npx tsc --noEmit
npm run tauri dev
```

Open a series and confirm the header, season chips, and episode cards use the new tokens, larger cover art, and fluid text. Close the app window.

- [ ] **Step 7: Commit**

```bash
git add src/components/SeriesView.tsx
git commit -m "feat(tv-redesign): restyle SeriesView with design tokens and larger cover art"
```

---

### Task 8: Tune `useResponsiveGrid.ts` constants for the larger card design

**Files:**
- Modify: `src/hooks/useResponsiveGrid.ts:18-31` (constants only — `calculateGridConfig`/`useResponsiveGrid`/`getGridClasses` logic is unchanged)

**Interfaces:**
- Consumes: nothing new.
- Produces: same `GridConfig` shape (`{ columns, cardHeight, estimatedRowHeight, gap }`) — only the numeric values change, not the type or the function signatures used by `MainScreen.tsx`.

- [ ] **Step 1: Update the breakpoint table and gap constant**

Old (lines 18–27):
```ts
const BREAKPOINTS: BreakpointConfig[] = [
  { minWidth: 0, columns: 2, minCardHeight: 200, maxCardHeight: 240 },
  { minWidth: 640, columns: 3, minCardHeight: 220, maxCardHeight: 260 },
  { minWidth: 1024, columns: 4, minCardHeight: 240, maxCardHeight: 300 },
  { minWidth: 1440, columns: 5, minCardHeight: 260, maxCardHeight: 320 },
  { minWidth: 1920, columns: 6, minCardHeight: 280, maxCardHeight: 360 },
  { minWidth: 2560, columns: 7, minCardHeight: 300, maxCardHeight: 400 },
];

const GAP = 16; // Tailwind gap-4
```

New:
```ts
const BREAKPOINTS: BreakpointConfig[] = [
  { minWidth: 0, columns: 2, minCardHeight: 240, maxCardHeight: 300 },
  { minWidth: 640, columns: 3, minCardHeight: 260, maxCardHeight: 320 },
  { minWidth: 1024, columns: 4, minCardHeight: 300, maxCardHeight: 380 },
  { minWidth: 1440, columns: 4, minCardHeight: 340, maxCardHeight: 420 },
  { minWidth: 1920, columns: 5, minCardHeight: 380, maxCardHeight: 480 },
  { minWidth: 2560, columns: 6, minCardHeight: 420, maxCardHeight: 540 },
];

const GAP = 24; // Tailwind gap-6 (Task 6 widened the grid gap to match)
```

(Fewer, larger columns at every breakpoint — trades density for the larger, cover-forward cards from Task 3. `minWidth: 1440` now caps at 4 columns instead of 5, since a 60" TV viewed from a couch benefits more from bigger cards than more columns.)

- [ ] **Step 2: Type-check and visually verify**

```bash
npx tsc --noEmit
npm run tauri dev
```

Resize the window through a few widths and confirm the grid re-flows without cards clipping or overlapping (the virtualizer's row-height math now matches the actual rendered card height). Close the app window.

- [ ] **Step 3: Run the existing hook test suite to confirm no regression**

```bash
npm run test:run -- useResponsiveGrid
```

Expected: no test file exists yet for this hook (check `src/test/hooks/`) — if `test:run` reports "no tests found" for this pattern, that's expected and fine; the broader suite is re-checked in Task 11.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useResponsiveGrid.ts
git commit -m "feat(tv-redesign): tune grid breakpoint constants for larger card design"
```

---

### Task 9: Restyle the shared `ui/tabs.tsx` primitive

**Files:**
- Modify: `src/components/ui/tabs.tsx`

**Interfaces:**
- Consumes: tokens from Task 2.
- Produces: same `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` exports, same props (thin wrapper over `@radix-ui/react-tabs`) — consumed by `Settings.tsx` in Task 10.

- [ ] **Step 1: Replace `TabsList`'s className (line 14–17)**

Old:
```tsx
    className={cn(
      'inline-flex h-12 w-full items-center justify-center border-b border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400',
      className
    )}
```

New:
```tsx
    className={cn(
      'inline-flex h-14 w-full items-center justify-center border-b border-border text-text-muted',
      className
    )}
```

- [ ] **Step 2: Replace `TabsTrigger`'s className (line 29–32)**

Old:
```tsx
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm font-medium text-gray-600 transition-all hover:text-gray-900 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 dark:text-gray-400 dark:hover:text-gray-200 dark:data-[state=active]:border-blue-500 dark:data-[state=active]:text-blue-500',
      className
    )}
```

New:
```tsx
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap border-b-2 border-transparent px-5 py-4 text-fluid-sm font-medium text-text-muted transition-all hover:text-text focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-accent data-[state=active]:text-accent',
      className
    )}
```

- [ ] **Step 3: Type-check and visually verify**

```bash
npx tsc --noEmit
npm run tauri dev
```

Open Settings and confirm the tab bar (General/Playback/Parental/About) uses the new tokens. Close the app window.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/tabs.tsx
git commit -m "feat(tv-redesign): restyle shared tabs primitive with design tokens"
```

---

### Task 10: Restyle `Settings.tsx` shell and the four settings tabs

**Files:**
- Modify: `src/components/Settings.tsx` (modal shell only — header/close button/tab list wrapper; the large amount of state/logic in this file is untouched)
- Modify: `src/components/settings/GeneralTab.tsx`
- Modify: `src/components/settings/PlaybackTab.tsx`
- Modify: `src/components/settings/ParentalTab.tsx`
- Modify: `src/components/settings/AboutTab.tsx`

**Interfaces:**
- Consumes: tokens from Task 2, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` from Task 9.
- No prop or state changes to any of these files — apply the substitution table from the top of this plan directly to every className in these five files.

- [ ] **Step 1: Find the modal shell in `Settings.tsx` and swap its container classes**

```bash
grep -n "fixed inset-0\|bg-white\|dark:bg-gray-800\|border-gray-200\|dark:border-gray-700" src/components/Settings.tsx | head -20
```

For each match in the modal's outer wrapper/header (not inside form logic), apply: `bg-white` / `dark:bg-gray-800` → `bg-surface`; `border-gray-200` / `dark:border-gray-700` → `border-border`; `text-gray-900` / `dark:text-white` → `text-text`; `text-gray-500` / `dark:text-gray-400` → `text-text-muted`. Use the Edit tool for each match with enough surrounding context to target it uniquely (do not use `replace_all` blindly — verify each hit is presentation, not inside an unrelated conditional).

- [ ] **Step 2: Apply the substitution table to all four settings tab files**

For each of `GeneralTab.tsx`, `PlaybackTab.tsx`, `ParentalTab.tsx`, `AboutTab.tsx`, run:

```bash
grep -c "gray-\|blue-600\|blue-500\|blue-400\|blue-700\|text-xs\|text-sm\|text-base\|text-lg\|text-xl\|text-2xl\|text-3xl" src/components/settings/GeneralTab.tsx src/components/settings/PlaybackTab.tsx src/components/settings/ParentalTab.tsx src/components/settings/AboutTab.tsx
```

Then, file by file, apply the exact substitution table from the top of this plan (`bg-gray-50`→`bg-bg`, `bg-white`/`dark:bg-gray-800`→`bg-surface`, `bg-gray-100`/`bg-gray-200`/`bg-gray-700`/`dark:bg-gray-700`→`bg-surface-hover`, `text-gray-900`/`dark:text-white`→`text-text`, `text-gray-400/500/600/700`/`dark:text-gray-300/400`→`text-text-muted`, `border-gray-200/300`/`dark:border-gray-600/700`→`border-border`, `bg-blue-600`/`hover:bg-blue-700`→`bg-accent`/`hover:bg-accent-hover`, `text-blue-600`/`dark:text-blue-400`→`text-accent`, `border-blue-600`/`dark:border-blue-400`→`border-accent`, `focus:ring-blue-500`→`focus:ring-accent`, `text-xs`→`text-fluid-xs`, `text-sm`→`text-fluid-sm`, `text-base`→`text-fluid-base`, `text-lg`→`text-fluid-lg`, `text-xl`→`text-fluid-xl`, `text-2xl`→`text-fluid-2xl`, `text-3xl`→`text-fluid-3xl`). Use one `Edit` call per distinct old/new class combination found (there will be several per file — each is a real, mechanical substitution, not a judgment call), with `replace_all: true` where the exact same class string repeats verbatim across the file.

- [ ] **Step 3: Type-check and visually verify**

```bash
npx tsc --noEmit
npm run tauri dev
```

Open Settings and click through all four tabs (General, Playback, Parental, About). Confirm every label, input, toggle, and button uses the new tokens/fluid sizes and nothing is left with a stray `gray-`/`blue-` class (spot-check with the same `grep -c` command from Step 2 — count should be 0 or only semantic exceptions like error/success colors). Close the app window.

- [ ] **Step 4: Commit**

```bash
git add src/components/Settings.tsx src/components/settings/GeneralTab.tsx src/components/settings/PlaybackTab.tsx src/components/settings/ParentalTab.tsx src/components/settings/AboutTab.tsx
git commit -m "feat(tv-redesign): restyle Settings shell and tabs with design tokens"
```

---

### Task 11: Full-suite validation and manual TV checklist

**Files:** none (validation only)

- [ ] **Step 1: Run the full vitest suite**

```bash
npm run test:run
```

Expected: all existing tests pass unchanged (this plan touched no hook logic, store logic, or lib code — only JSX/className).

- [ ] **Step 2: Run a full type-check and production frontend build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both succeed with no errors. This validates the frontend alone (`dist/`) — it does not build the Tauri binary.

- [ ] **Step 3: Run a final grep sweep for leftover old classes across all touched files**

```bash
grep -rn "bg-gray-\|text-gray-\|border-gray-\|bg-blue-6\|text-blue-6\|border-blue-6\|focus:ring-blue-5" \
  src/components/ChannelCard.tsx \
  src/components/NowPlayingBar.tsx \
  src/components/CategoryBar.tsx \
  src/components/ContentTypeTabs.tsx \
  src/components/MainScreen.tsx \
  src/components/SeriesView.tsx \
  src/components/ui/tabs.tsx \
  src/components/Settings.tsx \
  src/components/settings/*.tsx
```

Expected: no matches (or only intentional semantic-color exceptions called out in Tasks 3/7, e.g. `bg-red-600`/`text-red-600` for stop/error states, `bg-purple-600` for the series button). Fix any stragglers found and amend the relevant task's commit with a small follow-up commit.

- [ ] **Step 4: Manual TV validation checklist (live, via `npm run tauri dev`)**

```bash
npm run tauri dev
```

With the app open, physically check from normal couch viewing distance on the 60" TV:

- [ ] Channel grid: card text, group name, and now-playing program are legible from the couch
- [ ] Series cards and episode cards show cover art filling the card (not a small centered logo)
- [ ] Now-playing bar text and stop button are legible and easy to hit
- [ ] Series page: header title, season chips, and episode descriptions are legible
- [ ] Settings: all four tabs are legible and controls are easy to read/click
- [ ] Both light and dark theme (toggle in Settings → General) still render coherently — this redesign is not a dark-only change, both themes consume the same tokens

- [ ] **Step 5: Report back to the user for approval**

Do not build the Tauri binary or touch the production install (`/opt/better-iptv-bin/usr/bin/better-ip-tv`) yet. Per the spec's cutover plan, that only happens after the user explicitly approves the look from Step 4. Stop here and hand control back for review.

---

## Self-review notes

- **Spec coverage:** dark/Netflix-style theme → Task 2 tokens; fluid adaptive typography → Task 2 `fontSize` + applied in every component task; larger cover-forward cards → Tasks 3 and 7; all listed components (ChannelCard, MainScreen, CategoryBar, ContentTypeTabs, SeriesView, Settings + tabs, NowPlayingBar) → Tasks 3–10; git worktree isolation → Task 1; no backend/hook-logic changes → enforced throughout, with the one declared exception (Task 8 constants) matching the spec's intent that presentation and its supporting numeric layout constants move together; validation via live TV check, no new automated tests → Task 11; cutover deferred until user approval → Task 11 Step 5.
- **Placeholder scan:** every task has concrete before/after code or exact shell commands; no "TBD" or "similar to Task N" shortcuts — Task 10's tab files use a fully-specified substitution table (real, exhaustive mapping) rather than hand-transcribing four repetitive form files.
- **Type consistency:** no function signatures, prop types, or exported interfaces change anywhere in this plan — `GridConfig`, `ChannelCardProps`, `NowPlayingBarProps`, `SeriesViewProps`, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` all keep their existing shapes.
