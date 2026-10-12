# Nature Glass

The five primary sections retain their existing routes, content and controls.
This is a presentation layer, not a new app shell.

## Materials and scope

- `shared/styles/nature-glass.css`: shared Soft, Floating and Solid material tokens,
  palette tokens, light borders, shadows, radii, unsupported-blur and reduced-transparency fallbacks.
- `features/home/nature-home.css`: morning cream/sage light, scene surround,
  quick links, readiness, news and sensor panels. Night/dawn/dusk remain distinct.
- `features/weather/nature-weather.css`: cool sky light, frosted forecast panels,
  opaque readable metrics and branded active controls.
- `features/market/nature-market.css`: warm harvest palette, search, catalogue,
  listing surfaces and existing sheets/forms.
- `features/settings/settings-nature.css`: pearl/lavender surfaces, profile,
  category panels and dense forms; scoped by the `nature-settings` wrapper.

Chat keeps its existing mint glass theme and all message behavior. The navbar
implementation and shell styles are untouched. Theme variables are scoped within
pages so lazy-loaded styles do not recolor navigation or other workspace screens.

All background lighting is static CSS. No image assets, font changes or graphics
dependencies were added. No filters are applied to WebGL, product photos or a
layer over the model. Blur is limited to selected panels and small floating
surfaces; repeated catalogue cards and weather metrics do not use backdrop blur.

## Verification

Run commands inside the existing Docker toolchain, not by installing host packages:

```sh
pnpm typecheck
pnpm build
EGIN_URL=http://localhost:4935 node apps/mobile/tests/nature-glass.cjs
EGIN_URL=http://localhost:4935 node apps/mobile/tests/home-weather.cjs
EGIN_URL=http://localhost:4935 node apps/mobile/tests/scene-performance.cjs
EGIN_URL=http://localhost:4935 node apps/mobile/tests/chat-glass.cjs
EGIN_URL=http://localhost:4935 node apps/mobile/tests/market-viewport.cjs
```

The Nature Glass browser check covers all five pages in Chromium and WebKit at
320, 390, 768 and 1280px; verifies unchanged navbar styling/geometry, no horizontal
page overflow, safe-area spacing, unfiltered WebGL, camera/layer controls, day/night
presentation and navigation after lazy CSS loads. Screenshots are saved under
`test-results/nature-glass`. It uses weather/session fixtures and only read-only
market requests to the isolated local preview. It must not target production.

WebKit emulation checks engine/layout behavior, not physical iPhone GPU performance.
The scene scheduler regression checks idle/offscreen/hidden rendering and input
response; it is not a device FPS benchmark. There is no lint script in the project.
