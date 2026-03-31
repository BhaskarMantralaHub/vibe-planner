# Design System — Component Reference

## Components

| Component | File | Key Props |
|-----------|------|-----------|
| `Button` | `button.tsx` | `variant` (primary/secondary/danger/ghost/link), `size` (sm/md/lg/xl/icon), `brand`, `loading`, `fullWidth`, `asChild` |
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
| `CardMenu` | `card-menu.tsx` | Portal-based three-dot dropdown menu. `items` array with `label`, `icon`, `color`, `onClick`, `dividerBefore`. Auto-closes on click + scroll + resize. `anchorRef` for positioning, `width` prop. |
| `RefreshButton` | `refresh-button.tsx` | `onRefresh` (async callback), `variant` (bordered/glass), `size`, `title`. Self-managed spinner + disabled state. |
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

## Theme Configuration

- **Toolkit theme** is configurable via 4 CSS variables in `globals.css`: `--toolkit`, `--toolkit-accent`, `--toolkit-hover`, `--toolkit-glow` — change these to rebrand the entire toolkit (Vibe Planner, ID Tracker, Sports, Admin)
- **Cricket theme** is configurable via 4 CSS variables in `globals.css`: `--cricket`, `--cricket-accent`, `--cricket-hover`, `--cricket-glow` — change these to rebrand the entire cricket app
- Both themes are independent — cricket can move to a separate repo without affecting toolkit
