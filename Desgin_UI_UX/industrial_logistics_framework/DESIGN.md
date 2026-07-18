---
name: Industrial Logistics Framework
colors:
  surface: '#f7fafc'
  surface-dim: '#d7dadc'
  surface-bright: '#f7fafc'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f4f6'
  surface-container: '#ebeef0'
  surface-container-high: '#e5e9eb'
  surface-container-highest: '#e0e3e5'
  on-surface: '#181c1e'
  on-surface-variant: '#43474e'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eef1f3'
  outline: '#74777f'
  outline-variant: '#c4c6cf'
  surface-tint: '#455f88'
  primary: '#002045'
  on-primary: '#ffffff'
  primary-container: '#1a365d'
  on-primary-container: '#86a0cd'
  inverse-primary: '#adc7f7'
  secondary: '#1960a3'
  on-secondary: '#ffffff'
  secondary-container: '#7db6ff'
  on-secondary-container: '#00477f'
  tertiary: '#002713'
  on-tertiary: '#ffffff'
  tertiary-container: '#003f23'
  on-tertiary-container: '#4bb278'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e3ff'
  primary-fixed-dim: '#adc7f7'
  on-primary-fixed: '#001b3c'
  on-primary-fixed-variant: '#2d476f'
  secondary-fixed: '#d3e4ff'
  secondary-fixed-dim: '#a2c9ff'
  on-secondary-fixed: '#001c38'
  on-secondary-fixed-variant: '#004881'
  tertiary-fixed: '#91f8b8'
  tertiary-fixed-dim: '#74db9d'
  on-tertiary-fixed: '#002110'
  on-tertiary-fixed-variant: '#00522f'
  background: '#f7fafc'
  on-background: '#181c1e'
  surface-variant: '#e0e3e5'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  data-mono:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 24px
  grid-gutter: 16px
  density-compact: 8px
  density-comfortable: 16px
---

## Brand & Style

The design system is engineered for the high-velocity environment of FMCG warehousing, specifically optimized for the beverage industry. The brand personality is **authoritative, systematic, and resilient**. It prioritizes utility over decoration, ensuring that warehouse managers and floor supervisors can process high-density inventory data without cognitive fatigue.

The design style is **Corporate / Modern** with a lean towards **Utility-First Minimalism**. It utilizes a structured hierarchy, high-contrast status indicators, and a clean "industrial" aesthetic that feels robust and dependable. The visual language conveys stability (through deep navies) and operational urgency (through clear, semantic signaling). 

**Emotional Response:**
- **Confidence:** Users feel the system is stable and the data is accurate.
- **Efficiency:** The UI fades into the background, letting the task take priority.
- **Clarity:** Critical alerts (expiry, low stock) are impossible to miss.

## Colors

The palette is rooted in professional "Logistics Navy" to establish trust. Actionable elements utilize a brighter "Industry Blue" to distinguish interactive components from static branding.

- **Primary (#1A365D):** Used for navigation sidebars, headers, and primary branding elements. Represents the "foundation" of the warehouse.
- **Secondary (#2B6CB0):** The primary action color for buttons, active tabs, and selection states.
- **Surface & Background (#F7FAFC):** A cool neutral gray that reduces screen glare during long shifts.
- **Semantic Palette:**
    - **Success (#38A169):** Specifically for "Available" or "In-Stock" items.
    - **Warning (#D69E2E):** Reserved for "Near Expiry" (critical for beer/soft drinks) and "Low Stock."
    - **Danger (#E53E3E):** Used for "Expired," "Out of Stock," or "Critical Reorder Points."

## Typography

The design system utilizes **Inter** for its exceptional legibility in data-heavy environments and its neutral, technical appearance. 

The type scale is optimized for **Information Density**. While standard body text remains at 14px, a specialized `data-mono` style is used for SKUs, batch numbers, and quantities to ensure character distinction (e.g., distinguishing '0' from 'O'). 

For mobile views used on handheld scanners, font weights are bumped to `Medium (500)` or `Semi-Bold (600)` to ensure readability under varied warehouse lighting conditions.

## Layout & Spacing

This design system uses a **Fluid Grid** with a strict 4px baseline rhythm. The layout is designed to maximize screen real estate, reflecting the need to view large batches of data simultaneously.

- **Desktop:** A 12-column grid with 16px gutters. Sidebars are fixed at 240px to maximize the central data workspace.
- **Data Grids:** Use a "Compact" vertical rhythm (8px cell padding) to display more rows per screen without scrolling.
- **Form Layouts:** Use a "Comfortable" rhythm (16px - 24px) to prevent input errors during manual data entry.
- **Breakpoints:** 
    - **Large Desktop (1440px+):** Full 12-column span.
    - **Tablet (768px - 1024px):** Sidebar collapses to icons; grids shift to horizontal scroll.
    - **Handheld (Scanner/Mobile):** Single column stack; buttons increase to 48px height for thumb-taps.

## Elevation & Depth

To maintain an industrial and "flat" professional look, this design system avoids heavy shadows. Instead, it uses **Tonal Layering** and **Low-Contrast Outlines** to define hierarchy.

- **Level 0 (Background):** Neutral Gray (#F7FAFC).
- **Level 1 (Cards/Work Surface):** Pure White (#FFFFFF) with a 1px border (#E2E8F0). No shadow.
- **Level 2 (Modals/Popovers):** Pure White with a tight, 4px blur ambient shadow (10% opacity) to provide subtle separation.
- **Active State:** Elements in focus or "selected" rows in a grid use a subtle Blue tint (#EBF8FF) rather than a shadow.

## Shapes

The shape language is **Soft (0.25rem)**. This provides a professional, modern feel that is more approachable than sharp corners but avoids the "consumer-app" look of highly rounded corners. 

- **Input Fields & Buttons:** 4px radius (Standard).
- **Data Tags/Status Badges:** 4px radius. 
- **Large Container/Cards:** 8px radius (Large).
- **Selection Indicators:** Use vertical 4px bars on the left edge of active list items for a clean, structural indicator.

## Components

### Data Grids
The core of the WMS. Grids must feature:
- Sticky headers for long inventory lists.
- Zebra-striping (Background / #FFFFFF) for row tracking.
- Inline status badges for "Stock Status."
- Micro-charts (sparklines) within columns to show 7-day stock depletion.

### Status Badges
High-contrast pill shapes with `label-caps` typography.
- **Available:** Green background / White text.
- **Low Stock:** Amber background / Dark text.
- **Critical:** Red background / White text.

### Buttons
- **Primary:** Solid `Industry Blue` (#2B6CB0) with white text.
- **Secondary:** Outlined `Industry Blue` with 1px border.
- **Destructive:** Solid `Danger Red` (#E53E3E) for clearing inventory or canceling shipments.

### Charts
- **Gantt Charts:** Used for loading dock scheduling. Bars use `Primary` for scheduled and `Secondary` for in-progress.
- **Stacked Bars:** Used for SKU category breakdowns (e.g., Beer vs. Soft Drinks). Use a palette of Navy, Industry Blue, and Teal.

### Input Fields
Strictly rectangular with a 1px border. On focus, the border thickens to 2px in `Secondary Blue`. Use "Inner Labels" for compact forms to save vertical space.