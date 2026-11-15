# Reference Usage Plan (Phase 0, approved D-001)

Source: https://github.com/FirePheonix/vengeance-ui-blog-template — **MIT License** (copyright "2026", no named holder).
Policy: re-implement on our own tokens and names. No wholesale paste, no text/images/logo copied, no unused code or deps carried over.

| # | Reference piece | Ref file | Our use | Surface | How it changes |
|---|---|---|---|---|---|
| 1 | Semantic token architecture | `src/app/globals.css` | `styles/tokens.css` → Tailwind v4 `@theme` | All | Our palette (D-004) + difficulty colors; one radius/type/spacing scale; keep reduced-motion block; remove global scrollbar hiding; no light/dark switching |
| 2 | cva button pattern | `src/components/ui/button.tsx` | `ui/Button` — `primary` / `secondary` (+ `danger` for Admin destructive) | All | Heights 48 px (Admin) / 56 px (Player); `:active` press states, no hover-only feedback; focus-visible rings |
| 3 | `cn()` helper | `src/lib/utils.ts` | `lib/cn.ts` | All | Identical idea, 3 lines |
| 4 | Font pairing | `src/app/layout.tsx` | `next/font` self-hosted (works offline at venue) | All | Orbitron = timer, positions, race numbers, headlines; Geist = body/UI; Geist Mono = code in questions + tabular figures |
| 5 | Diagonal hatch texture | `src/app/(blog)/layout.tsx` | Track kerbs, pit wall, "tier sold out" difficulty card | Display, Player | Our colors; static CSS gradient (zero runtime cost) |
| 6 | Code block styling | `src/components/blog/article.tsx` (`BlogCodeBlock`) | Code snippets inside questions | Player, Admin preview | No hover copy button; larger mono size for phones; horizontal scroll on overflow |
| 7 | Navbar + Sidebar shell | `src/components/layout/navbar.tsx`, `sidebar.tsx` | Admin top bar + section rail (Race, Players, Questions, Settings) | Admin | Blog/search/theme logic removed; no framer-motion hover pill; static active state |
| 8 | Copy button | `src/components/ui/copy-button.tsx` | Copy join link | Admin | As-is concept, our tokens |
| — | `offset-path` TOC technique | `src/components/layout/toc.tsx` | Dropped (straight track, D-002) | — | — |

## Inherited dependencies
- `tailwindcss@4`, `@tailwindcss/postcss` — styling
- `class-variance-authority` — button/card variants
- `clsx`, `tailwind-merge` — `cn()`
- `lucide-react` — the single icon set
- `next/font` (part of Next.js) — Geist, Geist Mono, Orbitron (all SIL Open Font License 1.1 — free for this use)

**Not inherited:** next-themes, framer-motion (motion library decided in Phase 3), react-markdown, rehype-raw, remark-gfm, mermaid, react-force-graph-2d, gray-matter, server-only.

## Licensing
- MIT permits use/modification. Since we re-implement rather than copy, no notice is strictly required; we will still add a `THIRD_PARTY_NOTICES.md` crediting the template as design inspiration, and include the MIT text if any non-trivial code shape survives.
- Do not use: their logo (`logo-icon.tsx`), blog text content, README media.
- Fonts: OFL 1.1 — bundling is fine.
