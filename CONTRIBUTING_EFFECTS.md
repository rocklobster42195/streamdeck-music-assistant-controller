# Contributing a Panorama Effect

Panorama effects are the ambient backgrounds on Stream Deck + dials. They run on the **Panorama** dial and as the **background** of the Track, Volume and Group Volume dials. When several dials with the same effect sit on adjacent columns, they join into **one continuous scene** spanning all of their displays.

The effects live in `packages/streamdeck-core` and are shared with the [Sonos Controller](https://github.com/rocklobster42195/streamdeck-sonos-controller) plugin. A new effect therefore benefits both plugins. Adapted from the Sonos Controller's guide.

## Adding an effect, step by step

1. Create `packages/streamdeck-core/src/panorama/effects/my-effect/index.ts` and default-export an `EffectDefinition` (see below).
2. Register it in `packages/streamdeck-core/src/panorama/registry.ts`, which is one import plus adding it to the array. MA-C has no code generator, so the list is explicit.
3. Add translations for the effect name and its fields to `plugin/…sdPlugin/en.json` and `de.json`:
   ```json
   "effect": { "my-effect": { "name": "My Effect", "speed": "Speed" } }
   ```
   The key is `effect.<id>.name`, and `effect.<id>.<field key>` for each settings field. If a translation is missing, the English `displayName`/`label` from your definition is shown.
4. `npm run build`. The property inspector builds its controls from your `settingsSchema` automatically.
5. Try it without hardware using `node tools/sd-sim/panorama.mjs sim-out`, which places effects on several simulated dials and saves the frames as PNGs. Change the effect ids in that script to yours. Then check it on a real Stream Deck +, both solo and with two or three adjacent dials.
6. Open a pull request.

There is no runtime sandbox: effect code runs in the plugin process, so it is reviewed at PR time. The engine catches exceptions from effect code (`safeEffectCall`), so a broken effect skips frames instead of crashing the plugin.

## The interface

See `packages/streamdeck-core/src/panorama/types.ts`:

```ts
export interface EffectDefinition<S = Record<string, unknown>> {
  /** Stable id, stored in user settings — never change it once released. */
  id: string;
  /** Fallback name (the translated name comes from effect.<id>.name). */
  displayName: string;
  defaultSettings: S;
  /** Drives the auto-generated PI controls: range, color, checkbox (and select). */
  settingsSchema: EffectField[];
  /** Tick interval this effect wants (default 100 ms). Fast motion may need less. */
  preferredTickMs?: number;
  createInstance(): EffectInstance<S>;
}

export interface EffectInstance<S> {
  /** On group formation AND whenever displays join/leave — width = displays × 200. */
  initPanorama(ctx: { width: number; height: number; settings: S }): void;
  /** Once per tick PER GROUP: all physics/state here. */
  tickPanorama(dtMs: number): void;
  /** Once per tick PER DISPLAY: only project/draw; returns an SVG fragment. */
  renderSlice(offsetX: number, width: number, height: number): string;
  onSettingsChange?(settings: S): void;
  destroy?(): void;
  /** Only called on the Panorama dial itself (content dials keep their own controls). */
  onRotate?(ticks: number): void;
  onPress?(): void;
  onTouch?(x: number, y: number): void;
  /** What rotating can change ("count", "speed", "density", …), in the order a press cycles
   *  through them; getControl/setControl read and switch the active one. */
  getControls?(): string[];
  getControl?(): string;
  setControl?(id: string): void;
  getIndicatorValue?(): number;
  /** Settings your effect changed itself (e.g. speed after rotating) — MA-C saves them. */
  getRuntimeSettings?(): Partial<S>;
}
```

**Dial controls:** if rotating changes a value, list it in `getControls()` and give the matching schema field `control: "<id>"` (e.g. `{ key: "savedSpeed", type: "range", …, control: "speed" }`). The Panorama dial then shows a small badge with the value's icon and level while turning, and a press switches between your values (and the lyrics timing when lyrics are on). The PI shows the same icon next to the field. Known ids with icons: `count`, `speed`, `density` (others get the speed icon; ask for a new one in your PR). With more than one control, `setControl` must switch what `onRotate` changes. With a single control, a press still goes to `onPress` when lyrics are off.

**Colors:** when the user enables **Cover color**, MA-C passes the accent color of what is playing as `color`, and also as `primaryColor` and `landColor` if your schema has those keys. Name your main color field `color` and it follows the cover automatically.

**Raster images:** `renderSlice` must return synchronously, so use a **PNG** data URI built with `encodePngDataUri` from `packages/streamdeck-core/src/render/png.ts` (see Boing Ball). Don't use BMP; it isn't reliably decoded.

A minimal effect:

```ts
// packages/streamdeck-core/src/panorama/effects/solid-color/index.ts
import type { EffectDefinition, EffectInstance } from '../../types.js';

interface Settings { color: string }

class SolidColor implements EffectInstance<Settings> {
  private color = '#87AE73';
  initPanorama(ctx: { settings: Settings }) { this.color = ctx.settings.color; }
  tickPanorama() {}
  onSettingsChange(s: Settings) { this.color = s.color ?? this.color; }
  renderSlice(_offsetX: number, w: number, h: number) {
    return `<rect width="${w}" height="${h}" fill="${this.color}"/>`;
  }
}

const solidColor: EffectDefinition<Settings> = {
  id: 'solid-color',
  displayName: 'Solid Color',
  defaultSettings: { color: '#87AE73' },
  settingsSchema: [{ key: 'color', type: 'color', label: 'Color', default: '#87AE73' }],
  createInstance: () => new SolidColor(),
};

export default solidColor;
```

## Dos and don'ts (display load)

Every display of a group is redrawn on every tick. A heavy effect **stalls input for every dial in the panorama**, including dials running other effects.

**Do:**
- Put all non-trivial per-frame work into `tickPanorama`. It runs once per group, however many displays there are.
- Keep `renderSlice` to projection and SVG building. It runs once **per display**.
- Scale element counts by panorama width. Five displays have five times the area.
- Keep the total SVG element count low. Dozens are fine, hundreds will lag.
- Re-derive state in `initPanorama` when it is called again because a display joined or left.
- Guard against `NaN` and unbounded drift. Dials can run for days.
- Release timers and listeners in `destroy()`.

**Don't:**
- Don't do O(n²) or other super-linear work in `renderSlice`. Compute it once per tick and cache it.
- Don't do I/O, image decoding or text measurement in `tickPanorama` or `renderSlice`.
- Don't assume a fixed number of displays.
- Don't throw. Validate inputs defensively.
- Don't use module-level mutable state. Each group gets its own instance.

## PR checklist

- [ ] `packages/streamdeck-core/src/panorama/effects/<id>/index.ts` default-exports an `EffectDefinition`, and it is registered in `registry.ts`.
- [ ] Translations `effect.<id>.*` exist in `en.json` and `de.json`.
- [ ] `npm run build`, `npm test` and `npm run lint` pass. The effect appears in the picker, and its fields render in the PI.
- [ ] Checked solo and in a 2+ display panorama (simulator frames attached; hardware if possible).
- [ ] No per-display heavy work in `renderSlice`, and `destroy()` cleans up.
- [ ] Sonos Controller: note in the PR that the effect should be synced there, too (shared code, see its `CONTRIBUTING_EFFECTS.md`).
