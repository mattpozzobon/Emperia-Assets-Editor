# Equipment attachments

Attachments are a sparse collection of physical points. An item profile may have
zero, one, two, three, five or more attachments; empty positions emit nothing.
Belt potion bindings refer to the actual physical potion slots, independently
of the five-button hotbar. The default profile binds assets 1/4/3/2 to physical
potion slots 1/2/3/4. Attachment IDs identify artwork independently of the
physical slot; their catalog points match these bindings. The fifth slot
has no default artwork yet. Custom profiles remain explicit.

Attachments 1/2/3 have their own object records and use the artwork migrated from
Equipment 74/75/76 respectively. Equipment 74/75/76 remain as transparent records
so every subsequent equipment retains its original public index. The artwork at
Equipment 77 stays in Equipment. Attachments have independent, stable indices.
Loading or switching editor tabs does not migrate, clear or renumber equipment.
`beltPouch`, `backpackLeft`, `backpackRight`, and `backpackBottom` remain
available for explicit future assets and gameplay bindings.

## Authoring

In an item's server properties, open **Item attachments** and enable **Use custom
attachments**. Select each position, its attachment asset and, for potion-driven
belt visuals, a one-based potion slot. Leave the potion slot blank for a static
visual. An empty custom profile disables attachments; disabling the custom profile
restores the default profile. Profiles use numeric ItemAttr 295, for example:

```json
{"295":[{"point":"belt1","attachmentId":1,"potionSlot":0},{"point":"belt5","attachmentId":5,"potionSlot":4}]}
```

Stored potion indices are zero-based. Profiles cannot duplicate a physical point,
reference a missing potion slot or use a point owned by another equipment slot.
Additional positions need their own artwork in Attachments. Different asset
variants may share the same physical point for use by different items.

Open **Attachments** in the Equipment/Hair/Beard/Attachments dropdown. Belt/Backpack filters separate attachments from
item-linked and other cosmetic equipment. Each attachment has a physical point,
its own sprite record, a name, and draw ranks for north/east/south/west. Clicking its
preview opens the existing texture editor. New backpack points can be added here.
Names, points, sprite art and directional draw ranks are editable in this catalog.

EOBJ v19 appends an independent attachment object bank after Beard, and adds its
UInt16 count after the Beard header count. After the pose library, each attachment
has a name, a reserved UInt16 word (written as 0xFFFF and ignored on read), a
point code and four UInt8 directional ranks. Attachment IDs are one-based within
this bank, independently of equipment indices. Client, server and Data Editor
read this layout. Editing attachment frames does not change equipment records.

To author the artwork, neutralize the liquid in Attachments 1/2/3 and
add a second sprite layer with a yellow mask over the liquid (`primary`). Keep
glass, cork, and other fixed colours outside that region. Colours come from the
item's authored appearance; unconfigured masks are neutral white. The two-region appearance
model remains available for attachments; there are no potion-specific mask
channels. Without masks, the current baked sprite colours remain visible.

## Runtime and transport

The canonical model lives in `Emperia-Server/src/shared/attachments.ts`. The
protocol generator copies it into the client and Asset Editor and checks drift.
`node scripts/build/generate-attachment-contract.mjs --check` validates this
contract independently of the other protocol catalogs.
An active point carries `{ attachmentId, appearance? }`, where appearance
uses the existing exclusive colour/material model. NPCs and monsters author the
same canonical records; old flags and visual-equipment IDs are rejected. Player attachments are derived from equipment and
are not persisted separately.

The server projects both belt and backpack profiles through
`src/game/core/item/equipment/item-attachments.ts`. The Data Editor uses one
`OutfitAttachmentsEditor` for NPCs and creatures and reads the real attachment
catalog for asset choices, mask colours and portrait rendering.

In Data Editor, **Professions → Alchemy → Potions → Mask colour**
configures the Primary RGB used by potion artwork. The catalog shows one colour
swatch per potion, and copying a colour changes only the destination's appearance.
The colour tab keeps its selectors to the right of the belt previews. These appearances
are stored separately from gameplay effects in `potion-balance.json.appearances`;
a colour-only edit does not author a combat override or change first-tick timing.
The server compiles the appearance when the watched catalog loads. A catalog
reload invalidates cached belt projections on their next notification even when
the potion item IDs stay unchanged. Buff-only potions can have a visual too.

The server uses the same potion-slot layout as the hotbar, including belts whose
potion region does not start at container index zero. Potion colours come from
the authoritative potion balance definitions. Container and equipment mutations
use the existing coalesced notification, and appearance equality avoids another
outfit publication when only stack quantity changes. Belt clearing preserves
backpack points. Retired equipment cannot publish pending mutations.

Full outfits mark the presence of the attachment section with header bit 11.
The full section is a UInt8 active-entry count followed by a UInt8 point code
and the existing direct-appearance payload for each populated point. Empty full
outfits omit the section. Appearance deltas contain only changed entries: the
same code and payload for an addition/recolour, or the code and UInt16 zero to
remove one point. Removing all attachments explicitly removes the previous active
points; an empty patch leaves the collection unchanged. Unaffected points retain
their previous values. RGB, palette and material appearances share the slot codec.

There are 255 wire points: the seven historical codes, belt4–belt127 and
backpack1–backpack124. The protocol bound is independent of asset IDs (UInt16).
Auxiliary version 56 and entity-update version 24 require coordinated server/client
rollout. Rust retains source routing and final assembly ownership; outfit source
payloads remain length-delimited bytes, with no second attachment projection.

The generic coloured payload can use more bytes than the old presence-only
flags. Empty full outfits still occupy four bytes. This change provides richer
state rather than a claimed bandwidth reduction. Actual FPS/throughput gains
have not been benchmarked.

Item binding profiles are compiled once per immutable prototype. Each equipped
item retains its projection and source IDs; quantity-only changes skip rebuilding
attachment appearances. Only semantic differences publish another outfit. Swapping
a profile removes stale points without clearing attachments owned by another item.
Each distinct potion source is read once per container capture, including profiles
with multiple attachments bound to the same slot. Change detection and projection
use one catalog snapshot; static-only profiles do not load the potion catalog.

The potion editor indexes recipes and definitions when their inputs change, so
colour edits do not repeat recipe grouping or search indexing. Its previews cache
original base/mask pixels by asset frame and direction, tint copies of the base,
and retain a scratch canvas. The cache does not accumulate entries for every
chosen colour and releases frames when their asset objects become unreachable.

The renderer caches only active attachment layers, their group lookup and all eight
draw orders. Frame arrays grow with active layers and are retained across frames;
removing attachments clears the old groups. Asset generations invalidate the cache.
Mask composition is cached by sprite, mask and explicit appearance, so identical
attachments share textures across characters. Pre-caching and composite/effect
rendering visit the same active collection and use the same appearance.

## Checks and use

`npm run validate:attachments` checks all asset readers, unchanged sprite frame
groups, 512 full attachment combinations/modes, real appearance deltas, potion
slot positions, duplicate types, consumption/reordering/unequip, retired
equipment, mask pixels, and shared texture identities. It also checks variable
profiles up to 255 active points, one-entry patches, owner isolation, profile
shrinkage, real dynamic frame resolution and asset reload invalidation.
`npm run validate:compact-outfit` checks 65,536 slot/attachment/helmet/light
combinations and trailing-field boundaries.

Restart the server through its normal entry point (which rebuilds the native
runtime), rebuild/reload the client, and reload the Asset Editor together. Existing
v17 assets work until the next v19 compilation. No sprite pixels, production
deployment, or live player database rows were changed for this implementation.
