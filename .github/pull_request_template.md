## What and why

<!-- What does this change, and which problem does it solve? Link the issue: "Closes #123". -->

## How it was tested

<!-- Unit tests, simulator scenarios (npm run sim:…), PI preview, real Stream Deck (model)? -->

## Screenshots

<!-- For anything visible: simulator PNGs from sim-out/, PI preview screenshots, or a photo. -->

## Checklist

- [ ] `npm run build && npm test && npm run lint && npm run validate -w mac-plugin` pass
- [ ] No hard-coded user-visible text; new keys are in `en.json` **and** `de.json`
- [ ] README and CHANGELOG (`[Unreleased]`) updated if users notice the change
- [ ] No secrets, tokens, IPs or personal names in code, logs or screenshots
- [ ] Needs a change in `streamdeck-kit`? Linked the kit PR
