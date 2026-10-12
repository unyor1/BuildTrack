# Valencia Construction Services — Color Palette

Extracted from `Company-Profile-VCS.docx` (theme/fill/text colors in the document XML, plus dominant colors of the embedded logo and icon images).

## Brand colors

| Role | Name | Hex | Source |
|---|---|---|---|
| **Primary** | Valencia Magenta | `#9E1F93` | Most used fill/text accent in the profile (44 uses) |
| Primary (light) | Magenta Bright | `#A52098` | Second pink used in the profile |
| Primary (deep) | Logo Plum | `#852474` | Dominant color of the logo image |
| Primary (darker) | Plum Dark | `#7C326B` | Logo/header image tone |
| Primary (muted) | Plum Soft | `#884778` | Logo/header image tone |
| Primary (darkest) | Plum Night | `#3B0C35` | Logo shadow tone |
| **Accent** | Valencia Orange | `#F18B00` | Service icons in the profile |
| Text (warm dark) | Ink Brown | `#2A251D` | Main body text (130 uses) |
| Text (cool dark) | Ink Slate | `#24252E` | Headings/body text (106 uses) |
| Surface | White | `#FFFFFF` | Backgrounds |

## Derived tints (for UI states, not in the source)

| Use | Hex |
|---|---|
| Magenta 50 (page tint) | `#FBEFFA` |
| Magenta 100 (hover bg) | `#F3D6F0` |
| Magenta 600 (hover) | `#871A7D` |
| Magenta 800 (pressed) | `#68135F` |
| Orange 100 | `#FFE8C7` |

## Status colors (pins and QA) — not from the brand, chosen for readability

| Status | Hex |
|---|---|
| Verified / Completed | `#1CA875` |
| In Progress | `#F18B00` |
| Issue / Correction | `#D93A3A` |
| Not Started | `#1A9FE5` |

## CSS tokens

```css
:root {
  --brand-primary: #9e1f93;
  --brand-primary-light: #a52098;
  --brand-primary-deep: #852474;
  --brand-primary-dark: #7c326b;
  --brand-primary-night: #3b0c35;
  --brand-accent: #f18b00;
  --ink: #2a251d;
  --ink-cool: #24252e;
  --surface: #ffffff;
  --magenta-50: #fbeffa;
  --magenta-100: #f3d6f0;
  --magenta-600: #871a7d;
  --magenta-800: #68135f;
  --status-verified: #1ca875;
  --status-progress: #f18b00;
  --status-issue: #d93a3a;
  --status-pending: #1a9fe5;
}
```

## Notes
- The current frontend (`src/index.css`) uses `--purple: #68255f` and `--gold: #f7ae00`. Those differ slightly from the company profile (`#9E1F93` and `#F18B00`); migrating means swapping those two tokens.
- Check text contrast: `#9E1F93` on white passes AA for large text and buttons with white text; use `#68135F` for small magenta text.
