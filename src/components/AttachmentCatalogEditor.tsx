import { useState } from 'react';
import { useOBStore } from '../store';
import { ATTACHMENT_POINTS, POTION_ATTACHMENT_COLORS, type AttachmentPoint } from '../lib/attachments.generated';
import type { AttachmentCatalogEntry } from '../lib/types';
import { OutfitThumbnail } from './EquipmentCatalogEditor';

const POINT_LABELS: Record<AttachmentPoint, string> = {
  belt1: 'Belt · Slot 1', belt2: 'Belt · Slot 2', belt3: 'Belt · Slot 3', beltPouch: 'Belt · Pouch',
  backpackLeft: 'Backpack · Left', backpackRight: 'Backpack · Right', backpackBottom: 'Backpack · Bottom',
};
const inputClass = 'rounded border border-emperia-border bg-emperia-bg px-2 py-1 text-xs';

export function AttachmentCatalogEditor() {
  const data = useOBStore(state => state.objectData);
  const update = useOBStore(state => state.updateAttachmentCatalogEntry);
  const remove = useOBStore(state => state.removeAttachmentCatalogEntry);
  const [filter, setFilter] = useState('all');
  const [direction, setDirection] = useState(2);
  const [previewColor, setPreviewColor] = useState<keyof typeof POTION_ATTACHMENT_COLORS>('health');
  const [error, setError] = useState('');
  if (!data) return null;
  const entries = [...(data.attachmentCatalog?.values() ?? [])].filter(entry => entry.attachment
    && (filter === 'all' || entry.attachment.point.startsWith(filter))).sort((a, b) => a.attachmentId - b.attachmentId);
  const save = (entry: AttachmentCatalogEntry) => {
    try { update(entry); setError(''); } catch (failure) { setError(String(failure instanceof Error ? failure.message : failure)); }
  };
  const add = () => {
    const point = ATTACHMENT_POINTS.find(candidate => ![...(data.attachmentCatalog?.values() ?? [])].some(entry => entry.attachment?.point === candidate));
    if (!point) { setError('Every attachment point already has a visual. Edit its sprite below.'); return; }
    const attachmentId = (data.attachmentCount ?? 0) + 1;
    save({ attachmentId, name: POINT_LABELS[point], attachment: { point, ranks: point.startsWith('backpack') ? [3, 4, 4, 3] : [0, 0, 0, 0] } });
  };
  return <div className="space-y-4 p-4 text-emperia-text">
    <p className="text-xs text-emperia-muted">Each point represents a position. Potion colours follow the item in that slot. Backpack points are ready for future bindings.</p>
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Attachment category" className={inputClass} value={filter} onChange={event => setFilter(event.target.value)}>
        <option value="all">All attachments</option><option value="belt">Belt</option><option value="backpack">Backpack</option>
      </select>
      <select aria-label="Preview direction" className={inputClass} value={direction} onChange={event => setDirection(Number(event.target.value))}>
        {['North', 'East', 'South', 'West'].map((label, index) => <option key={label} value={index}>{label}</option>)}
      </select>
      <select aria-label="Potion preview colour" className={inputClass} value={previewColor} onChange={event => setPreviewColor(event.target.value as typeof previewColor)}>
        <option value="health">Health · Red</option><option value="mana">Mana · Blue</option><option value="stamina">Stamina · Green</option>
      </select>
      <button className={inputClass} onClick={add}>Add attachment point</button>
    </div>
    {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    {entries.length === 0 && <p className="text-xs text-emperia-muted">No attachments in this category.</p>}
    {entries.map(entry => <div key={entry.attachmentId} className="space-y-3 rounded border border-emperia-border p-3">
      <div className="flex flex-wrap items-center gap-3">
        <OutfitThumbnail equipmentAppearanceId={0} attachmentId={entry.attachmentId} size={48} direction={direction} primaryColor={POTION_ATTACHMENT_COLORS[previewColor]} />
        <div><strong className="text-xs">{POINT_LABELS[entry.attachment!.point]}</strong><p className="text-[10px] text-emperia-muted">Attachment #{entry.attachmentId}</p></div>
        <input aria-label={`Attachment ${entry.attachmentId} name`} className={inputClass} value={entry.name} onChange={event => save({ ...entry, name: event.target.value })} />
        {entry.attachmentId > 3 && entry.attachmentId === data.attachmentCount && <button className={inputClass} onClick={() => remove(entry.attachmentId)}>Remove</button>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-emperia-muted">
        <span>Draw order:</span>{['North', 'East', 'South', 'West'].map((label, index) => <label key={label}>{label} <input aria-label={`${entry.attachment!.point} draw order ${label}`} className={`${inputClass} w-14`} type="number" min={0} max={15} value={entry.attachment!.ranks[index]} onChange={event => {
          const ranks = [...entry.attachment!.ranks] as [number, number, number, number]; ranks[index] = Number(event.target.value);
          save({ ...entry, attachment: { ...entry.attachment!, ranks } });
        }} /></label>)}
      </div>
      <p className="text-[10px] text-emperia-muted">Click the sprite to edit its texture. Colours become visible after adding the liquid mask; other pixels keep their original colours.</p>
    </div>)}
  </div>;
}
