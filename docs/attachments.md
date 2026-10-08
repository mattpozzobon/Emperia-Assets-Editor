# Equipment attachments

Attachments use physical points independently of the item type. The first three
potion hotbar slots map to `belt1`, `belt2`, and `belt3`. Empty slots remain empty;
equal potion types do not collapse into one visual. Hotbar slots four and five
remain usable but have no character sprite in this initial profile.

The stable visuals 800/801/802 retain equipment sprites 74/75/76. Visual 803
retains sprite 77 for `beltPouch`. `backpackLeft`, `backpackRight`, and
`backpackBottom` are supported by the model, protocol, renderer, and authoring UI;
their gameplay bindings and artwork can be added later. Backpack contents are
not automatically exposed as attachments.

## Authoring

Open **Equipment → Attachments**. Belt/Backpack filters separate attachments from
item-linked and other cosmetic equipment. Each attachment has a physical point,
an equipment sprite, a name, and draw ranks for north/east/south/west. Clicking its
preview opens the existing texture editor. New backpack points can be added here.
The reserved belt visual IDs keep their physical point, while their sprite
bindings and draw ranks remain editable.

EOBJ v18 stores the point code (zero for ordinary visual equipment) after each
visual's name, followed by four UInt8 draw ranks when a point is present. Readers
still accept previous formats and infer the four historical belt points. All
sprite data remains unchanged. The Asset Editor compiles v18; the client, server
visual catalog, and Data Editor preview loader understand this metadata.

The artwork step is intentionally pending: neutralize the liquid in 74/75/76 and
add a second sprite layer with a yellow mask over the liquid (`primary`). Keep
glass, cork, and other fixed colours outside that region. Health uses RGB
`FF0000`, mana `0000FF`, and stamina `00FF00`. The ordinary two-region appearance
model remains available for attachments; there are no potion-specific mask
channels. Without masks, the current baked sprite colours remain visible.

## Runtime and transport

The canonical model lives in `Emperia-Server/src/shared/attachments.ts`. The
protocol generator copies it into the client and Asset Editor and checks drift.
An active point carries `{ visualEquipmentId, appearance? }`, where appearance
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
The section is a UInt8 presence bitmap followed by the existing direct-visual
appearance payload for each populated point in canonical order. Header bits
12–14 are reserved and rejected. Appearance deltas replace the sparse attachment
snapshot, including an empty bitmap to clear every point. RGB, palette, and
material appearance payloads share the slot codec. Auxiliary protocol version
54 and entity-update version 22 require coordinated server/client rollout.

The generic coloured payload can use more bytes than the old presence-only
flags. Empty full outfits still occupy four bytes. This change provides richer
state rather than a claimed bandwidth reduction. Actual FPS/throughput gains
have not been benchmarked.

Mask composition is cached by sprite, mask, and explicit appearance so identical
attachments share textures across characters. Draw ordering is cached per outfit
and asset generation. Unstyled attachments use a neutral appearance rather than
inheriting hair or belt colour. Both normal and composite/effect drawing and
pre-caching use the same attachment appearance.

## Checks and use

`npm run validate:attachments` checks all asset readers, unchanged sprite frame
groups, 512 full attachment combinations/modes, real appearance deltas, potion
slot positions, duplicate types, consumption/reordering/unequip, retired
equipment, mask pixels, and shared texture identities.
`npm run validate:compact-outfit` checks 65,536 slot/attachment/helmet/light
combinations and trailing-field boundaries.

Restart the server through its normal entry point (which rebuilds the native
runtime), rebuild/reload the client, and reload the Asset Editor together. Existing
v17 assets work until the next v18 compilation. No sprite pixels, production
deployment, or live player database rows were changed for this implementation.
