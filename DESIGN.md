---
name: Paradise Code
description: A precise, open desktop instrument with the real editor at its center.
colors:
  shell: "#111015"
  ink: "#f5f3fb"
  muted: "#b6b1c2"
  divider: "#393441"
  iris: "#bdb0ff"
  cool-white: "#f4f2fa"
  action-fill: "#f1eef9"
  action-ink: "#20192f"
typography:
  display:
    fontFamily: "Sora, Arial, sans-serif"
    fontSize: "clamp(48px, 5.6vw, 82px)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Sora, Arial, sans-serif"
    fontSize: "clamp(34px, 4vw, 57px)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Sora, Arial, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    lineHeight: 1.65
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 650
    lineHeight: 1.65
rounded:
  action: "7px"
spacing:
  compact: "12px"
  regular: "20px"
  roomy: "25px"
  group: "30px"
components:
  button-primary:
    backgroundColor: "{colors.action-fill}"
    textColor: "{colors.action-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.action}"
    padding: "14px 23px"
  button-outline:
    textColor: "{colors.ink}"
    rounded: "{rounded.action}"
    padding: "11px 17px"
---

# Design System: Paradise Code

## Overview

**Creative North Star: "The editor is the exhibit."**

Paradise Code presents a precise desktop instrument through a quiet, dark outer shell, an iris-lit product stage, and a cool-white reading surface. Large Sora headings carry the identity; compact system text keeps the surrounding explanation familiar. The real application capture supplies the visual detail.

This records the implemented website, its folded-P identity, and its shared presentation patterns. It does not redefine the Code – OSS workbench inside the screenshot. The independent, local, public-preview product identity constrains both imagery and claims.

**Key Characteristics:**
- Real product imagery, with the folded P as a compact signature.
- Near-black neutrals with violet light and a cool-white contrast surface.
- Bold, closely spaced headings above restrained, readable supporting text.
- Broad section spacing around dense, purposeful workflow details.

## Colors

The palette uses violet-tinted neutrals, a pale iris accent, and light actions against dark surfaces.

### Primary
- **Iris** marks keyboard focus and belongs to the violet family used by the stage, selected tabs, and product identity. Those existing related shades are context-specific values, not a universal accent scale.
- **Action Fill / Action Ink** create the recurring high-contrast download control.

### Neutral
- **Shell / Ink** provide the default page and foreground pairing.
- **Muted** supports explanatory copy on the dark shell.
- **Divider** separates tabs, engineering details, and disclosure rows.
- **Cool White** provides the contrasting native-product section and skip-link surface. Dark text replaces the light foreground on this surface.

**The Stage Light Rule.** Concentrate the broad violet gradient around the product capture; keep explanatory dark sections tonally quiet.

## Typography

**Display Font:** Locally hosted Sora Bold, with Arial and sans-serif fallbacks.
**Body Font:** The platform system sans-serif stack.
**Label/Mono Font:** UI labels and keycaps use the body family; illustrative terminal content uses ui-monospace, SFMono-Regular, Menlo, monospace.

The type ramp makes a strong jump from compact interface labels to broad, balanced headings. Heading letters sit close together; prose has substantially more leading. The wordmark uses the system family with contrasting weights for “paradise” and “code.”

### Hierarchy
- **Display:** The hero statement uses the display token; at the mobile breakpoint it becomes `clamp(35px, 8.5vw, 53px)` with a line height of (1.19).
- **Headline:** Section headings follow the headline role, with local size adjustments for the native, download, and FAQ sections.
- **Title:** Workflow panel headings use the title role. Smaller subsection headings preserve Sora and a bold weight.
- **Body:** Supporting paragraphs are generally (12–17px), with mobile copy generally (12–13px). Explanatory copy is constrained by context, commonly (37–50ch).
- **Label:** Primary actions use the label token. Navigation and secondary information use compact system text rather than introducing another display face.

**The Two Voices Rule.** Use Sora for content headings and the system family for prose, controls, and navigation.

## Layout

The outer page uses centered containers up to (1440px), with percentage gutters: generally (5%) for the shell and (8%) for explanatory sections. The product capture has its own maximum width of (1200px). Desktop sections combine broad vertical spacing with paired columns; the workflow panel uses equal columns, while the native and FAQ sections use a (1:1.15) relationship.

At (950px), gutters and gaps tighten. At (650px), the main navigation is hidden while the download link remains, paired sections stack, and the architecture becomes readable rows with descriptive text beside its heading. The download actions can wrap. The complete product capture scales with its aspect ratio instead of being replaced by a mock interface.

Recurring local gaps and padding use the frontmatter spacing values, alongside content-specific measurements. This is an observed rhythm, not a complete spacing scale. Preserve ample separation between sections and tighter spacing within a related control or explanation.

## Elevation & Depth

Depth comes primarily from tonal layering and the violet stage. Soft shadows lift the product window, light action buttons, and native app icon; explanatory details rely on background tone and fine rules. There are no hard offset shadows in the implemented vocabulary.

The product window enters with a small vertical move, slight perspective tilt, and clipping reveal. Buttons have a brief hover transition. Reduced-motion preference disables animations and transitions and restores immediate scrolling. Exact motion and shadow values live in the sidecar.

## Shapes

The folded P in `icons/mark.svg` is the identity: angular planes, pale upper surfaces, an iris side, and strong dark negative space. Use the existing asset rather than replacing its geometry with a text glyph.

Actions use the shared modest corner radius. Detail panels are softly curved (12px); keycaps are tighter (4px). The product frame uses (13px) corners on desktop and (6px) on mobile. Its image carries proportional clipping that removes the surrounding screenshot matte while preserving the real application shape. These distinct roles are not a single interchangeable radius scale.

Thin separators structure tabs, workflow rows, architecture notes, and FAQs. Small circles belong to availability status and installation numbering. Interface icons are inline stroked SVGs with rounded line endings.

## Components

### Buttons
Light filled actions lead to downloads; outlined actions support deeper inspection. Both are compact, gently rounded, and can pair text with an inline SVG. Light buttons brighten and rise slightly on hover; outlined buttons gain a dark violet fill. Links, buttons, and disclosure summaries receive the shared visible iris focus outline (3px) with an offset of (6px). Mobile action padding and height reduce while remaining usable.

### Navigation
The compact header pairs the folded-P wordmark, simple text links, and a persistent download link. Hover brightens navigation text. Mobile preserves the wordmark and download action. A keyboard-accessible skip link appears on focus.

### Workflow Tabs
An understated ruled tab row uses a brighter label and violet bottom border for selection. Icons accompany text; selection is also expressed through `aria-selected`. Only the selected panel is visible. Arrow keys, Home, and End move selection and focus; inactive tabs leave the normal tab sequence.

### Detail Panels and Keycaps
Workflow demonstrations sit on a slightly lighter violet-black surface. Shortcut rows pair text with compact system-font keycaps and tabular numerals. Terminal examples identify themselves as illustrative; extension rows show names and concise capabilities. These are evidence details, not a generic marketing-card grid.

### Product Exhibit
Use the actual workbench capture with a descriptive alternative text and a short, factual caption. Keep the screenshot legible and its surrounding frame restrained. The preview is a product image, not an interactive editor.

### Release Actions and Disclosures
The release action starts with a working releases-page link and only becomes a direct download when published metadata validates. Keep preview and platform limits beside the action. FAQ rows use native `details`/`summary`, fine separators, and a CSS-drawn plus that changes when expanded.

## Do's and Don'ts

### Do:
- **Do** keep product imagery real and identify illustrative workflow content.
- **Do** use the existing folded P and the implemented Sora/system-font pairing.
- **Do** carry selection, focus, keyboard navigation, and reduced-motion behavior into reused components.
- **Do** keep preview, compatibility, and measured performance limits visible where they affect a decision.

### Don't:
- **Don't** imply adoption, performance advantages, certification, or supported platforms without product evidence.
- **Don't** replace the real workbench with an invented editor mockup.
- **Don't** use the rejected bracket-P identity or warm cream palette.
- **Don't** treat decorative microcopy, one-off colors, or unverified direction-candidate metadata as reusable system rules.
