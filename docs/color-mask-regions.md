# Primary and Secondary colour model

The client, server, data editor and asset editor now use exactly two palette indices: `primary` (yellow mask) and `secondary` (red mask). The renderer no longer tints green/blue mask pixels or remaps a four-value runtime palette. Cache identities, character creation, hair selection, NPC/monster authoring, schemas and persistence all use the two-field model.

## Assets and authored data

All 87 identified colour-mask appearances use yellow/red only. Original green and blue regions were merged into yellow; original red remains red. The final model pass canonicalized EOBJ region metadata to `[0]` or `[0, 1]` and converted 68 authored palettes in 25 server files, including tutorial outfits. Existing EOBJ readers retain format compatibility; the asset writer only accepts canonical two-region metadata. Historical four-channel conversion helpers live under `scripts/legacy-*`, outside application code.

The asset backup is `C:/Dev/Emperia-Assets/current/backup/before-primary-secondary-model-2026-10-05`. Authored-file backups and the mapping report are under `C:/Dev/Emperia-Assets/migrations/primary-secondary-model-1791217919678`. Earlier mask migration reports are historical; use `model-migration.json` and the current-model validator for the final package.

## Network

A coloured slot carries two UInt8 palette indices, or one when both indices are equal. An uncoloured slot carries none. The obsolete four-channel sparse encoding was removed. Normal colour payloads shrink from four bytes to two; total slots are five bytes with distinct colours or four with uniform colours, before optional metadata. Protocol versions are world 27, player 18, entity 20, auxiliary 40, item 5 and container 6. Client and server must update together.

## Database and rollout

`Emperia-Server/migrations/20261005170000_primary_secondary_outfit_colors.sql` converts persisted hair colours from yellow/red to primary/secondary and removes obsolete keys. Equipment dye uses the exact persisted item RGB tint. All current hair appearances use original yellow as their primary source. The migration is idempotent and was tested using a temporary table in local PostgreSQL; live player rows were not changed during development. The normal server migration runner applies it during startup. Restart the server and reload the updated client/editors together. No production deployment was performed.

## Verification

- `npm run validate:primary-secondary`: 87 appearances, 4,886 RGB/BGR rendering comparisons, canonical metadata, 68 authored palettes, persistence schemas and server/data-editor asset loading.
- `npm run validate:color-wire`: real server writer/client reader round trips and packet boundaries.
- Client `npm run test:outfit-mask`, `npm run test:object-definitions`, `npm run test:monster-outfit-assets`.
- Server `node -r ts-node/register/transpile-only scripts/validation/verify-primary-secondary-migration.ts`: isolated local PostgreSQL migration and idempotence check.

The older `validate:color-alignment` command verifies historical pixel migrations against their historical reports; it is not the final runtime-model check.

## Compact full-outfit envelope

The UInt16 outfit ID is followed by a UInt16 header. Bits 0–8 indicate populated included slots, bit 9 enables the helmet, bits 10–13 indicate nonzero health/mana/energy/bag attachment values, and bit 14 indicates a nonzero light-source ID. Bit 15 is reserved and rejected by the reader. Slots retain their existing payloads. Present attachment values follow in that order as UInt8, then the optional UInt16 light ID. Omitted values decode to zero. Appearance deltas retain their existing framing and can still explicitly clear slots/attachments/light.

The size calculator and full writer share the header computation and visit only set slot bits after that computation. No temporary slot arrays or per-write closures are allocated. `npm run validate:compact-outfit` exercises the real client reader against the server writer for all 32,768 slot/extra/helmet combinations with trailing-field boundary checks. Empty outfits shrink from 11 to 4 bytes, a representative five-piece outfit from 33 to 26, and all-slots/all-extras from 105 to 104. A local synthetic benchmark showed effectively unchanged serialization time; this is primarily a bandwidth improvement.

## Item-owned mask colours

Player equipment stores exact RGB `maskPrimary` and optional `maskSecondary` on the item. Secondary inherits primary when omitted; equal secondary values are omitted when saving. Attribute 260 keeps existing saved RGB values; attribute 265 stores distinct secondary values. Legacy input aliases are accepted at the persistence boundary, so existing item colours require no SQL copy. Historical primary zero remains the no-dye sentinel; secondary zero is valid black.

Equipped appearances derive their colours from items. Saved player outfits do not duplicate equipment colours, and owner login derives equipment from item packets. NPCs and hair retain directly authored primary/secondary palette indices. Plain equipment never inherits hair colours. Material IDs remain separate and resolve through the material catalog; they are not converted into colour-mask dyes.

The client shared mask-colour resolver is used by item textures, equipped sprites, tooltip swatches and data-editor previews. Only yellow/red colour-mask pixels change; unmasked pixels, alpha and material regions remain intact. Texture and visual cache identities include both colours, including equipment transition snapshots.

Item wire primary uses field bit 6; distinct secondary uses state bit 7 and an RGB UInt24 after material composition. Equipped slots use flags 6 and 7 for primary and distinct secondary RGB. Authored palette selections retain compact palette encoding. Native fixed semantic records are 26 bytes; client, server and the native module must update together.

Checks: client `npm run test:item-mask-tint` and `npm run test:equipment-tint`; server `scripts/validation/integration/item-tint-persistence.ts`; asset-editor `node scripts/validate-mask-colors.cjs` checks 60 persistence/wire combinations, while `node scripts/validate-item-tint.cjs` checks real item 5918 mask pixels. `validate:compact-outfit` covers optional RGB fields and packet boundaries. Native assembly tests include distinct secondary and canonical-record validation.

For a running server that locks `native/dist/emperia-node.node`, stop it before running `node native/scripts/build-embedded.mjs`, then restart the server and reload the client. A validated replacement was staged at `.cache/mask-colors/emperia-node.node`; staging does not update the running process.
