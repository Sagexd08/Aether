# UI audit (D1)

Method: code inspection of `client/src` plus `npm run build`. No screenshots were taken, so contrast and layout at 390/1440 are not measured.

## Fixed in D2/D3/D3b

- Generate screen claimed Stable Diffusion 1.4/1.5/XL, offered width/height (256-1024), model select, negative prompt, style presets, an "enhance prompt" action and four photo presets. None apply to the 64x64 from-scratch model. Replaced by one prompt box, steps, guidance and seed.
- Hard-coded blue/purple gradient, bold title and gradient background in `Layout.tsx`. Replaced by the token palette.
- Dark mode was forced on at load. The theme is now remembered in `localStorage`, light by default.
- A toast on every success. The generate screen now toasts errors only.
- Lightbox, copy and delete controls on the result removed in favour of download, reuse settings and new.

## Still open

- `OnboardingModal.tsx:21,219` offers `sd15`, `sdxl`, `sd14` as a default model.
- `Dashboard.tsx:71,195` falls back to `sd15` and shows an uppercase model name.
- `GenerationCard.tsx` and `UpscalePage.tsx` still use the old gray/blue utility classes and `dark:` pairs; they follow the new tokens only where they use semantic names.
- `Home` no longer shows remaining daily quota: no endpoint or header exposes it. Needs a small server addition (D5).
- Progress is still the polled value, not per-step (D4).
- History panel reuses `RecentGenerations` cards (D6 redesign).
- Keyboard and axe pass not done (D7). Focus ring and reduced motion are in `index.css`.
- Muted text token is `60 2% 40%` on `60 20% 98%` (about 5.4:1, estimated, not measured).
