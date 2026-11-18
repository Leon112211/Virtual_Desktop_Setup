# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

桌间 Deskspace — a local-first, browser-based 3D desk-layout editor. Users size a desk and place, rotate, and edit common objects (monitor, speakers, keyboard, controller, pegboard) or their own imported GLB/glTF models to preview a real-size layout before buying or moving physical items. Everything runs client-side: no backend, no accounts, no cloud sync. All UI text and user-facing errors are Chinese (zh-CN).

Stack: React 19 + TypeScript (strict), Vite, Three.js via React Three Fiber (`@react-three/fiber`) + Drei, Zustand (state), Zod (validation), idb (IndexedDB). Tests: Vitest (unit) + Playwright (e2e).

## Commands

Install locked dependencies (first time, or after `package-lock.json` changes):

```bash
npm ci
```

Dev server (Vite, port 5173, listens on all interfaces):

```bash
npm run dev
```

Typecheck / build / test:

```bash
npm run typecheck   # tsc -b only (noEmit: typecheck, no output)
npm run build       # tsc -b && vite build → dist/
npm test            # vitest run — unit tests colocated at src/**/*.test.ts
```

Single unit test (or by name):

```bash
npx vitest run src/domain/project.test.ts
npx vitest run -t "编辑历史"
```

E2E (Playwright). Requires the dev server already running on `:5173`, and Chromium installed once:

```bash
npx playwright install chromium
npm run test:e2e                 # or: npx playwright test tests/editor.spec.ts
```

Formatting (Prettier: single quotes, semicolons, trailing commas, 100-col, 2-space indent):

```bash
npm run format
npm run format:check
```

`vite.config.ts` doubles as the Vitest config (`environment: 'node'`, tests under `src/**/*.test.ts`). `npm run build` runs the typecheck then the Vite bundle; `tsc` itself emits nothing.

## Architecture

### Units and coordinates (spans many files — get this right)
- The internal data model is in **meters**; the UI displays and edits **centimeters**. Convert with `cm()` and `meters()` from `src/domain/project.ts`. Domain/store/scene code works in meters; components convert at the boundary.
- Coordinate system: X = left/right, Y = up, Z = front/back, with +Z toward the default viewer. Item `x`/`z` are relative to the desk center; items sit on the desk top (world Y = `desk.height`). Desk `height` is the top-surface height, not leg length.

### Data model and validation (`src/domain/`)
- The whole project is a Zod-validated, JSON-serializable object: `Project { schemaVersion, id, name, desk, items[], assets[] }` (see `projectSchema` in `src/domain/project.ts`).
- Per-object schemas (`desk`, `item`, `size`, `asset`) enforce ranges and formats. Cross-field rules live in `projectSchema.superRefine`: unique IDs, ≤40 MiB total assets, ≤500k scene triangles, and imported items must reference an existing asset.
- `src/domain/placement.ts` computes the rotated item footprint (`footprint`) and the out-of-bounds check (`isOutOfBounds`).
- `src/domain/monitor.ts` keeps the monitor's screen 16:9 (`monitorParts`/`monitorSize`); the monitor is rendered specially, unlike other built-ins.

### State and editing (`src/store/editorStore.ts`)
- Single Zustand store, `useEditor`. **Every edit goes through `commit(update)`**: it `structuredClone`s the project, applies the mutation, re-validates with `projectSchema.parse`, and only commits if the JSON actually changed. This makes invalid edits impossible and gives idempotent history (a no-op edit adds no history entry). New mutations must follow this path rather than mutating state directly.
- Undo/redo is a `past`/`future` array of full `Project` snapshots, capped at 50; `withAssets` keeps asset metadata alive across undo (so deleted items' assets survive in history).
- `blobs` is a separate `Map<string, Blob>` holding raw model bytes. It is **not** part of the serializable `Project` — keep JSON data and binary blobs separate.

### Rendering (`src/scene/`)
- `DeskScene.tsx` uses `<Canvas frameloop="demand">`: rendering is on-demand. Code that changes the scene must call `invalidate()` (from `useThree`) after mutating — this matters for drag and camera updates.
- Items render inside `<group position={[0, desk.height, 0]}>`, so they track desk height automatically. `SceneItem` renders one item's geometry and implements drag via manual pointer capture plus a `Raycaster`/plane intersection against the desk-top plane, disabling `OrbitControls` during the drag. Its wireframe/plane overlays are the selection highlight and out-of-bounds indicator.
- Built-in models are procedural (no external assets) and runtime-normalized to a unit cube by `unitBounds` (`src/scene/unitBounds.ts`), then scaled by `item.size`.
- **Exception — features that must keep a physical size:** the monitor (`MonitorModel`) and the pegboard (`PegboardModel`) are built at real metre scale and read `item.size` directly, because scaling a unit model would also scale fixed details. The SKÅDIS hole layout lives in `src/domain/pegboard.ts` (5 × 15 mm slots, 40 mm staggered pitch, 20 mm edge margin, R8 corners): resizing the board only adds or removes holes, and the slots render as instanced shapes on both faces.
- A React error boundary (`SceneBoundary`) catches WebGL/render failures and shows a fallback; the layout stays editable via the inspector.

### Model import (`src/assets/`)
- `inspectModel(blob, format)` is the single entry point for imported models. `preflightModel` does strict "trust nothing" validation of the glTF/GLB **before** `GLTFLoader` runs: glTF 2.0 only, embedded data-URI buffers/textures only, no Draco/Meshopt/KTX2/animation/skinning/sparse accessors, and byte/pixel/triangle budgets. It re-reads geometry and re-computes bounds rather than trusting exporter metadata.
- `normalizeModel` bottom-center-normalizes into a `LoadedModel { root, size, sourceSize, triangles }` (longest edge default 30 cm).
- `modelCache` (`src/assets/modelCache.ts`) owns GPU resources. Render clones (`SceneItem` uses `model.root.clone(true)`) share them and must **not** dispose them; only `disposeModel`/`clearModelCache` release resources. `clearModelCache` runs before replacing/resetting a project, and only once all rendered clones are unmounted.

### Persistence (`src/persistence/`)
- `projectRepository.ts`: IndexedDB autosave (via idb). `saveProject` writes the snapshot and all blobs in **one readwrite transaction** (atomic), and prunes unreferenced assets. `loadProject` returns `{ project, blobs }` or `null`; a missing blob leaves metadata intact so the UI shows a placeholder.
- `projectFile.ts`: single-file backup (`.desksetup.json`) with Base64-embedded resources. `exportProjectFile`/`importProjectFile` re-validate uniform scale for imported items and re-inspect models on import.

### UI (`src/components/`, `src/App.tsx`)
- `App.tsx` owns the top-level wiring: autosave (500 ms debounce through a `saveQueue`), keyboard shortcuts, view switching, model/project import-export, and the pending-import state. `Inspector` shows desk settings or the selected item's properties (`NumberField` = cm input, commit on blur/Enter, Escape cancels). `ModelLibrary` lists built-ins, the scene, and imported models. `ImportDialog` previews an imported model with real-size correction before accepting.

## Tests
- Unit tests (Vitest) are colocated as `*.test.ts` and run in a `node` environment; storage tests use `fake-indexeddb`. They cover domain validation, rotation bounds, edit history, model preflight/normalization, cache disposal, IndexedDB atomic rollback, project Base64, and resource validation.
- E2E (`tests/editor.spec.ts`, Playwright) needs the dev server on `:5173`, uses software WebGL (`swiftshader`) launch args and an isolated context. Covers drag/cancel, edit history, model import, refresh restore, cross-context backup, external-request blocking, and narrow-screen layout.
