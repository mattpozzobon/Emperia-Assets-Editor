# Equipment attachments

Attachments are a sparse collection of physical points. An item profile may have
zero, one, two, three, five or more attachments; empty positions emit nothing.
Belt potion bindings refer to the actual physical potion slots, independently
of the five-button hotbar. The legacy default profile still binds assets 1/2/3,
so existing belts retain their artwork until an explicit profile is authored.

Attachments 1/2/3 have their own object records and use the artwork migrated from
Equipment 74/75/76 respectively. Equipment 74/75/76 remain as transparent records
so every subsequent equipment retains its original public index. Files from the
defective compacted v19 export (183 equipment records) restore the three slots
and reverse the catalog remapping once. Source metadata records the reserved
slots to keep the repair idempotent. The artwork at Equipment 77 stays in Equipment with no
automatic attachment or belt pouch binding. New attachments receive their own
indices starting at 4. Reloading a v19 file with the earlier duplicated layout
also clears the three source slots without shifting any equipment indices.
`beltPouch`, `backpackLeft`, `backpackRight`, and `backpackBottom` remain
available for explicit future assets and gameplay bindings.

## Authoring

In an item's server properties, open **Item attachments** and enable **Use custom
attachments**. Select each position, its attachment asset and, for potion-driven
belt visuals, a one-based potion slot. Leave the potion slot blank for a static
visual. An empty custom profile disables attachments; disabling the custom profile
restores legacy defaults. Profiles use numeric ItemAttr 295, for example:

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
The reserved belt attachment IDs keep their physical point, while their sprite
art and draw ranks remain editable.

EOBJ v19 appends an independent attachment object bank after Beard, and adds its
UInt16 count after the Beard header count. After the pose library, each attachment
has a name, an optional legacy Equipment source (UInt16, 0xFFFF when absent), a
point code and four UInt8 directional ranks. Attachment IDs are one-based within
this bank, independently of equipment indices. Client, server and Data Editor
read this layout. Older assets migrate only Equipment 74/75/76 into this bank;
editing the attachment frames does not change the equipment record.

The artwork step is intentionally pending: neutralize the liquid in Attachments 1/2/3 and
add a second sprite layer with a yellow mask over the liquid (`primary`). Keep
glass, cork, and other fixed colours outside that region. Health uses RGB
`FF0000`, mana `0000FF`, and stamina `00FF00`. The ordinary two-region appearance
model remains available for attachments; there are no potion-specific mask
channels. Without masks, the current baked sprite colours remain visible.

## Runtime and transport

The canonical model lives in `Emperia-Server/src/shared/attachments.ts`. The
protocol generator copies it into the client and Asset Editor and checks drift.
An active point carries `{ attachmentId, appearance? }`, where appearance
uses the existing exclusive colour/material model. Legacy authored NPC/monster
flags are normalized on read; player attachments are derived from equipment and
are not persisted separately.

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
