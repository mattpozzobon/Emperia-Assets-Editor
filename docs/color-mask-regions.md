# Primary and Secondary colour model

The client, server, data editor and asset editor now use exactly two palette indices: `primary` (yellow mask) and `secondary` (red mask). The renderer no longer tints green/blue mask pixels or remaps a four-value runtime palette. Cache identities, character creation, hair selection, NPC/monster authoring, schemas and persistence all use the two-field model.

## Assets and authored data

All 84 identified colour-mask appearances use yellow/red only. Original green and blue regions were merged into yellow; original red remains red. The final model pass canonicalized EOBJ region metadata to `[0]` or `[0, 1]` and converted 68 authored palettes in 25 server files, including tutorial outfits. Existing EOBJ readers retain format compatibility; the asset writer only accepts canonical two-region metadata. Historical four-channel conversion helpers live under `scripts/legacy-*`, outside application code.

The asset backup is `C:/Dev/Emperia-Assets/current/backup/before-primary-secondary-model-2026-10-05`. Authored-file backups and the mapping report are under `C:/Dev/Emperia-Assets/migrations/primary-secondary-model-1791217919678`. Earlier mask migration reports are historical; use `model-migration.json` and the current-model validator for the final package.

## Network

A coloured slot carries two UInt8 palette indices, or one when both indices are equal. An uncoloured slot carries none. The obsolete four-channel sparse encoding was removed. Normal colour payloads shrink from four bytes to two; total slots are five bytes with distinct colours or four with uniform colours, before optional metadata. Protocol versions are world 25, player 16, entity 18 and auxiliary 38. Client and server must update together.

## Database and rollout

`Emperia-Server/migrations/20261005170000_primary_secondary_outfit_colors.sql` converts persisted hair colours from yellow/red to primary/secondary and removes obsolete keys. Equipment colours are derived from item tint. All current hair appearances use original yellow as their primary source. The migration is idempotent and was tested using a temporary table in local PostgreSQL; live player rows were not changed during development. The normal server migration runner applies it during startup. Restart the server and reload the updated client/editors together. No production deployment was performed.

## Verification

- `npm run validate:primary-secondary`: 84 appearances, 4,880 RGB/BGR rendering comparisons, canonical metadata, 68 authored palettes, persistence schemas and server/data-editor asset loading.
- `npm run validate:color-wire`: real server writer/client reader round trips and packet boundaries.
- Client `npm run test:outfit-mask`, `npm run test:object-definitions`, `npm run test:monster-outfit-assets`.
- Server `node -r ts-node/register/transpile-only scripts/validation/verify-primary-secondary-migration.ts`: isolated local PostgreSQL migration and idempotence check.

The older `validate:color-alignment` command verifies historical pixel migrations against their historical reports; it is not the final runtime-model check.

## Compact full-outfit envelope

The UInt16 outfit ID is followed by a UInt16 header. Bits 0–8 indicate populated included slots, bit 9 enables the helmet, bits 10–13 indicate nonzero health/mana/energy/bag attachment values, and bit 14 indicates a nonzero light-source ID. Bit 15 is reserved and rejected by the reader. Slots retain their existing payloads. Present attachment values follow in that order as UInt8, then the optional UInt16 light ID. Omitted values decode to zero. Appearance deltas retain their existing framing and can still explicitly clear slots/attachments/light.

The size calculator and full writer share the header computation and visit only set slot bits after that computation. No temporary slot arrays or per-write closures are allocated. `npm run validate:compact-outfit` exercises the real client reader against the server writer for all 32,768 slot/extra/helmet combinations with trailing-field boundary checks. Empty outfits shrink from 11 to 4 bytes, a representative five-piece outfit from 33 to 26, and all-slots/all-extras from 105 to 104. A local synthetic benchmark showed effectively unchanged serialization time; this is primarily a bandwidth improvement.
