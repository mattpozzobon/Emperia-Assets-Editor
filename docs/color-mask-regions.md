# Primary and Secondary colour model

The client, server, data editor and asset editor use exactly two colour regions: `primary` (yellow mask) and `secondary` (red mask). Runtime appearance colours are RGB; palette indices remain a picker and compact transport detail. The renderer no longer tints green/blue mask pixels or remaps a four-value runtime palette. Cache identities, character creation, hair selection, NPC/monster authoring, schemas and persistence all use the two-field model.

## Assets and authored data

All 87 identified colour-mask appearances use yellow/red only. Original green and blue regions were merged into yellow; original red remains red. The final model pass canonicalized EOBJ region metadata to `[0]` or `[0, 1]` and converted 68 authored palettes in 25 server files, including tutorial outfits. Existing EOBJ readers retain format compatibility; the asset writer only accepts canonical two-region metadata. Historical four-channel conversion helpers live under `scripts/legacy-*`, outside application code.

The asset backup is `C:/Dev/Emperia-Assets/current/backup/before-primary-secondary-model-2026-10-05`. Authored-file backups and the mapping report are under `C:/Dev/Emperia-Assets/migrations/primary-secondary-model-1791217919678`. Earlier mask migration reports are historical; use `model-migration.json` and the current-model validator for the final package.

## Network

A coloured slot carries two UInt8 palette indices, or one when both indices are equal. An uncoloured slot carries none. The obsolete four-channel sparse encoding was removed. Normal colour payloads shrink from four bytes to two; total slots are five bytes with distinct colours or four with uniform colours, before optional metadata. Current protocol versions live in `Emperia-Server/protocol/realtime-contract.schema.json` and are generated into every consumer. Client and server must update together.

## Database and rollout

`Emperia-Server/migrations/20261005170000_primary_secondary_outfit_colors.sql` converts persisted hair colours from yellow/red to primary/secondary and removes obsolete keys. Equipment dye uses the exact persisted item RGB tint. All current hair appearances use original yellow as their primary source. The migration is idempotent and was tested using a temporary table in local PostgreSQL; live player rows were not changed during development. The normal server migration runner applies it during startup. Restart the server and reload the updated client/editors together. No production deployment was performed.

## Verification

- `npm run validate:primary-secondary`: 87 appearances, 4,886 RGB/BGR rendering comparisons, canonical metadata, 68 authored palettes, persistence schemas and server/data-editor asset loading.
- `npm run validate:color-wire`: real server writer/client reader round trips and packet boundaries.
- Client `npm run test:outfit-mask`, `npm run test:object-definitions`, `npm run test:monster-outfit-assets`.
- Server `node -r ts-node/register/transpile-only scripts/validation/verify-primary-secondary-migration.ts`: isolated local PostgreSQL migration and idempotence check.

The older `validate:color-alignment` command verifies historical pixel migrations against their historical reports; it is not the final runtime-model check.

## Compact full-outfit envelope

The UInt16 outfit ID is followed by a UInt16 header. Bits 0–9 indicate populated included slots, bit 10 enables the helmet, bit 11 indicates the attachment section, and bit 15 indicates a light-source ID. Bits 12–14 are reserved and rejected. Attachments now use physical points and the shared appearance model, as documented in [Equipment attachments](attachments.md). A sparse point bitmap precedes direct-visual appearance payloads, followed by the optional UInt16 light ID. Appearance deltas can explicitly clear attachments with an empty point bitmap.

The size calculator and full writer share the header computation and visit only set slot bits after that computation. `npm run validate:compact-outfit` exercises the real client reader against the server writer for 65,536 slot/extra/helmet combinations with trailing-field boundary checks. Empty outfits remain four bytes. The original compact-envelope pass reduced empty outfits from 11 to 4 bytes and a representative five-piece outfit from 33 to 26; those measurements predate positional attachments. Coloured attachments carry more information than the old UInt8 presence flags, so their payload sizes should not be compared as a bandwidth reduction.

## One appearance model

```ts
type Appearance =
  | { kind: "material"; materialId: number; composition?: number }
  | { kind: "color"; primary: number; secondary?: number };
```

Items and outfit slots have one optional `appearance` property. Material mode resolves catalog colours, textures and effects. Colour mode uses exact RGB and touches only yellow/red mask pixels; omitted secondary inherits primary. Undefined appearance means no recolouring. Rendering never combines the two modes on an equipment layer.

The server's `src/shared/appearance.ts` is canonical. The protocol generator copies its platform-independent model and palette helpers into the client; `--check` detects drift. The data editor imports that same model and the client's shared `appearance-renderer.ts`. Inventory textures, equipped sprites, previews and equipment disappearance effects use the same appearance. Texture and loot-group identities include the whole appearance.

Player equipment owns the selection. The local outfit references the decoded item's appearance; saved player outfits retain only hair/base selection, and owner login does not duplicate equipment styling. NPC appearances are assigned directly. The 53 authored JSON colour selections and 15 tutorial selections were converted from palette indices to RGB. The editor still presents palette controls. Historical hair BGR palette values are converted at the boundary so the saved RGB matches the palette preview.

Item persistence retains numeric attributes 260/265 to preserve saved dye, and material attributes remain available for crafting/gameplay. `getAppearance()` derives exactly one visual mode: explicit dye wins, otherwise material styling. Material metadata is not sent a second time in colour-mode item packets. Old saved hair palettes are converted on read; subsequent saves write `hair.appearance`. No live database rows were rewritten for this refactor.

Outfit transport uses existing flags, without a mode string: exact palette matches occupy one or two bytes; arbitrary RGB uses three bytes per distinct colour. Material mode carries only its material ID and optional composition. The native fixed item record layout is unchanged by this refactor. The internal serializer fields are transport details, not parallel application colour properties.

Checks:

- `node scripts/validate-appearance-model.cjs`: shared contract, 399 legacy/new hair save round trips, exclusive schemas and item-owned player appearance.
- `node scripts/validate-mask-colors.cjs`: 60 item persistence, variable wire and native fixed-record combinations; crafting material survives while colour-mode wire omits it.
- `node scripts/validate-item-tint.cjs`: item 5918 changes 315 mask pixels and preserves unmasked pixels and alpha.
- `npm run validate:compact-outfit`: 32,768 envelope combinations and both appearance modes, palette/RGB colours and packet boundaries.
- Client `test:item-mask-tint` and `test:equipment-tint`: matching inventory/equipped material and colour pixels, cache changes, equipment replacement, transition snapshots and tooltip swatches.
- Data-editor NPC and monster save/load tests, plus client/server/editor type checks and builds.

Restart the server and reload the client and data editor together after updating. If the previous native-module migration has not been installed yet, stop the server before `node native/scripts/build-embedded.mjs`; the current appearance refactor adds no new fixed-record layout.
