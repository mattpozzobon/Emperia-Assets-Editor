import { useState } from 'react';
import { ATTACHMENT_POINTS, DEFAULT_BELT_BINDINGS, validateItemAttachmentBindings, type ItemAttachmentBinding, type AttachmentPoint } from '../lib/attachments.generated';
import type { AttachmentCatalogEntry } from '../lib/types';

const control = 'rounded border border-emperia-border bg-emperia-bg px-2 py-1 text-xs';
export function ItemAttachmentBindingsEditor({ bindings, catalog, owner, potionSlots, onChange }: {
  bindings?: ItemAttachmentBinding[]; catalog: ReadonlyMap<number, AttachmentCatalogEntry>;
  owner: 'belt' | 'backpack'; potionSlots: number; onChange: (value: ItemAttachmentBinding[] | undefined) => void;
}) {
  const [error, setError] = useState('');
  const assets = Array.from(catalog.values()).filter(entry => entry.attachment.point.startsWith(owner));
  const points = ATTACHMENT_POINTS.filter(point => point.startsWith(owner));
  const save = (value: ItemAttachmentBinding[] | undefined) => {
    try {
      if (value) {
        validateItemAttachmentBindings(value);
        if (value.some(binding => !binding.point.startsWith(owner)
          || (binding.potionSlot !== undefined && binding.potionSlot >= potionSlots))) throw new Error('Choose a position and potion slot that belong to this item.');
      }
      onChange(value); setError('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  };
  const add = () => {
    const point = points.find(point => !bindings?.some(binding => binding.point === point));
    const asset = assets.find(asset => asset.attachment.point === point) ?? assets[0];
    if (!point || !asset) return;
    save([...(bindings ?? []), { point, attachmentId: asset.attachmentId }]);
  };
  return <details className="rounded border border-emperia-border p-3">
    <summary className="cursor-pointer text-xs font-medium">Item attachments {bindings ? `(${bindings.length})` : '(default)'}</summary>
    <div className="mt-3 space-y-2">
      <label className="flex gap-2"><input type="checkbox" checked={bindings !== undefined} onChange={event => save(event.target.checked ? owner === 'belt' ? DEFAULT_BELT_BINDINGS.filter(binding => binding.potionSlot! < potionSlots).map(binding => ({ ...binding })) : [] : undefined)} />Use custom attachments</label>
      {bindings !== undefined && <>
        <p className="text-[10px] text-emperia-muted">Only configured, active attachments are shown. An empty profile shows none.</p>
        {bindings.map((binding, index) => <div key={binding.point} className="flex flex-wrap items-center gap-2">
          <select className={control} aria-label={`Attachment ${index + 1} position`} value={binding.point} onChange={event => save(bindings.map((value, row) => row === index ? { ...value, point: event.target.value as AttachmentPoint } : value))}>
            {points.map(point => <option key={point}>{point}</option>)}
          </select>
          <select className={control} aria-label={`Attachment ${index + 1} asset`} value={binding.attachmentId} onChange={event => save(bindings.map((value, row) => row === index ? { ...value, attachmentId: Number(event.target.value) } : value))}>
            {assets.map(asset => <option key={asset.attachmentId} value={asset.attachmentId}>#{asset.attachmentId} · {asset.name}</option>)}
          </select>
          {owner === 'belt' && <label className="flex items-center gap-1">Potion slot <input className={`${control} w-14`} type="number" min={1} max={Math.max(1, potionSlots)} aria-label={`Attachment ${index + 1} potion slot`} placeholder="Static" value={binding.potionSlot == null ? '' : binding.potionSlot + 1} onChange={event => save(bindings.map((value, row) => row === index ? { ...value, potionSlot: event.target.value === '' ? undefined : Number(event.target.value) - 1 } : value))} /></label>}
          <button className={control} onClick={() => save(bindings.filter((_, row) => row !== index))}>Remove</button>
        </div>)}
        <button className={control} disabled={!assets.length} onClick={add}>Add attachment</button>
      </>}
      {error && <p role="alert" className="text-red-400">{error}</p>}
    </div>
  </details>;
}
