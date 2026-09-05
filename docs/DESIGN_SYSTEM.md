# Design System — Component Reference

## Components

| Component | File | Key Props |
|-----------|------|-----------|
| `Button` | `button.tsx` | `variant` (primary/secondary/danger/ghost/link), `size` (sm/md/lg/xl/icon), `brand`, `loading`, `fullWidth`, `asChild`, `haptic` (opt-in — see Tactile Interactions) |
| `Input` | `input.tsx` | `label`, `error`, `brand` (auto-switches focus color) |
| `Dialog` | `dialog.tsx` | Radix Dialog: `DialogContent`, `DialogTitle`, `DialogDescription`, `DialogHeader`, `DialogFooter`, `DialogClose` |
| `Alert` | `alert.tsx` | `variant` (error/success/warning/info) |
| `Card` | `card.tsx` | `padding` (none/sm/md/lg), `shadow`, `animate` |
| `Badge` | `badge.tsx` | `variant` (purple/orange/red/green/blue/muted), `size` (sm/md) |
| `Spinner` | `spinner.tsx` | `size` (sm/md/lg), `brand`, `color` |
| `Skeleton` | `skeleton.tsx` | Just `className` — pulse loading placeholder |
| `Label` | `label.tsx` | `uppercase` flag |
| `EmptyState` | `empty-state.tsx` | `icon`, `title`, `description`, `action` |
| `Drawer` | `drawer.tsx` | `Drawer`, `DrawerHandle`, `DrawerTitle`, `DrawerHeader`, `DrawerBody`, `DrawerClose` — iOS keyboard-safe vaul wrapper |
| `FilterDropdown` | `filter-dropdown.tsx` | Category filter with counts, brand-aware (toolkit/cricket) |
| `CardMenu` | `card-menu.tsx` | Portal-based three-dot dropdown menu. `items` array with `label`, `icon`, `color`, `onClick`, `dividerBefore`. Auto-closes on click + scroll + resize. `anchorRef` for positioning, `width` prop. Flips above the anchor near the viewport bottom. Prefer `ActionSheet` for new mobile ⋮ menus. |
| `ActionSheet` | `action-sheet.tsx` | Bottom-sheet action menu (mobile-first CardMenu replacement). Same `CardMenuItem[]` shape, so migration is a component swap. `open`, `onOpenChange`, `title` (sr-only unless `showTitle`), rows ≥52px, destructive rows via `color: 'var(--red)'`. Built on the shared `Drawer`. |
| `RefreshButton` | `refresh-button.tsx` | `onRefresh` (async callback), `variant` (bordered/glass), `size`, `title`. Self-managed spinner + disabled state, and a ✓ shown **only** after `onRefresh` resolves. |
| `Text` | `text.tsx` | `size` (2xs/xs/sm/md/lg/xl/2xl), `weight`, `color`, `tracking`, `uppercase`, `truncate`, `tabular`, `as` (span/p/h1-h4/label) |
| `Toaster` | `toast.tsx` | Added to `providers.tsx`, use `toast()` from sonner anywhere |

## Usage

```tsx
import { Button, Input, Alert, Card, Dialog, DialogContent, DialogTitle } from '@/components/ui';
import { toast } from 'sonner';

<Button variant="primary" size="lg" loading={saving} fullWidth>Save</Button>
<Alert variant="error">{error}</Alert>
toast.success('Saved!');
```

## Brand Context

Components auto-detect brand from `BrandProvider`. Cricket pages use orange, toolkit uses purple.

```tsx
<BrandProvider brand="cricket">
  <Button variant="primary">Save</Button>  {/* orange gradient */}
</BrandProvider>
```

## Tactile Interactions

A thin native-feeling layer over the existing UI: press animation, haptics, and
honest async state. It adds no visual design — nothing here changes a colour,
a size or a layout.

### Press animation (CSS only, no animation library)

There is deliberately **no** Motion/Framer Motion in this project (a motion
library's chunks were poisoned by Cloudflare Pages dedup once already). Presses
are CSS transforms built on the motion tokens in `globals.css`, so they go
instant under `prefers-reduced-motion` with no JS branching.

| Class | Press scale | Use for |
|-------|-------------|---------|
| `.pressable` | `0.97` | Buttons and compact controls |
| `.pressable-selection` | `0.98` | Picking one of a set, and any **wide** target — `0.97` on a full-width row reads as the card lurching |
| `.animate-tactile-check` | — | A ✓ that ARRIVES after an operation succeeded (260ms, 1.08 overshoot) |

`Button` already carries `active:scale-[0.97]` in its base class; do not add
`.pressable` to it.

**Never put a bare `transition: transform` in an unlayered class.** Tailwind
utilities live in `@layer utilities`, and unlayered rules beat layered ones —
so the shorthand resets `transition-property` and silently kills any
`transition-colors` / `transition-opacity` on the same element. `.pressable`
therefore lists every property a press can change. See the comment in
`globals.css`.

### Haptics — `lib/haptics.ts`

```tsx
import { haptic } from '@/lib/haptics';
haptic('light');      // 10ms  — primary actions: Save, Confirm, Copy, Share
haptic('medium');     // 18ms  — meaningful/destructive: Revoke, Refresh a link, Revert
haptic('selection');  //  8ms  — picking one of a set: segment, season, filter, menu row
haptic('success');    // [9,45,14] — an operation that ACTUALLY succeeded
```

Pure progressive enhancement. Safe during SSR, feature-detected, throws never,
and rate-limited so a misplaced call cannot become a continuous hum. **No iOS
browser implements the Vibration API**, so on iPhone every one of these is a
no-op and the press animation carries the whole feel — never gate behaviour on
a haptic, and never surface its absence.

**Haptics are OPT-IN on `Button` (`haptic="light"`), by design.** A codebase
where every button vibrates is one where none of them mean anything. It also
keeps the set auditable: `grep -rn 'haptic=' `.

Do **not** haptic: passive links, plain navigation, bottom-tab switching (iOS
itself doesn't), opening a dropdown/sheet/dialog, hover, focus, scrolling, a
re-tap that changes nothing, or both halves of a toggle (like yes, un-like no).

### Async state — `hooks/use-async-action.ts`

```tsx
const copy = useAsyncAction(
  async () => { await navigator.clipboard.writeText(url); },
  { tapHaptic: 'light', successHaptic: null, onError: () => toast.error("Couldn't copy") },
);
<Button onClick={() => void copy.run()}>{copy.succeeded ? 'Copied' : 'Copy'}</Button>
```

Ordering is the whole point: tap haptic fires before any `await`, the action
starts immediately, and `success` happens **only** after the promise resolves.

**The action must THROW on failure.** A function that try/catches and toasts
its own error returns a *resolved* promise, so the hook would show a success
tick for an operation that never happened. Pass `onError` instead.

Also handles reentrancy (ref guard, so a double-tap in one frame can't
double-submit) and clears its timer on unmount.

## Theme Configuration

- **Toolkit theme** is configurable via 4 CSS variables in `globals.css`: `--toolkit`, `--toolkit-accent`, `--toolkit-hover`, `--toolkit-glow` — change these to rebrand the entire toolkit (Vibe Planner, ID Tracker, Sports, Admin)
- **Cricket theme** is configurable via 4 CSS variables in `globals.css`: `--cricket`, `--cricket-accent`, `--cricket-hover`, `--cricket-glow` — change these to rebrand the entire cricket app
- Both themes are independent — cricket can move to a separate repo without affecting toolkit
