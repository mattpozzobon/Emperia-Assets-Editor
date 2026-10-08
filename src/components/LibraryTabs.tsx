import { Accessibility, ArrowRight, ChevronDown, Link2, Package, Scissors, Shirt, ShoppingBasket, Sparkles, Swords } from 'lucide-react';
import { useOBStore } from '../store';
import { readItemProperty } from '../lib/item-properties';
import type { LibraryCategory } from '../lib/types';

const CATEGORIES: { key: LibraryCategory; label: string; icon: typeof Package }[] = [
  { key: 'item', label: 'Items', icon: Package },
  { key: 'market', label: 'Market', icon: ShoppingBasket },
  { key: 'outfit', label: 'Outfits', icon: Shirt },
  { key: 'effect', label: 'Effects', icon: Sparkles },
  { key: 'distance', label: 'Distance', icon: ArrowRight },
  { key: 'equipment', label: 'Equipment', icon: Swords },
  { key: 'hair', label: 'Hair', icon: Scissors },
  { key: 'beard', label: 'Beard', icon: Scissors },
  { key: 'attachments', label: 'Attachments', icon: Link2 },
];

const LIBRARY_GROUPS = [
  { label: 'Effects / Distance', keys: ['effect', 'distance'], icon: Sparkles },
  { label: 'Equipment / Hair / Beard / Attachments', keys: ['equipment', 'hair', 'beard', 'attachments'], icon: Swords },
] as const;

export function LibraryTabs() {
  const objectData = useOBStore((state) => state.objectData);
  const activeLibrary = useOBStore((state) => state.activeLibrary);
  const centerTab = useOBStore((state) => state.centerTab);
  const itemDefinitions = useOBStore((state) => state.itemDefinitions);
  const appearanceToItemIds = useOBStore((state) => state.appearanceToItemIds);
  useOBStore((state) => state.editVersion);
  const setActiveLibrary = useOBStore((state) => state.setActiveLibrary);
  const setCenterTab = useOBStore((state) => state.setCenterTab);

  if (!objectData) return null;

  const getCategoryCount = (category: LibraryCategory): number => {
    switch (category) {
      case 'item': return objectData.itemCount - 99;
      case 'outfit': return objectData.outfitCount;
      case 'effect': return objectData.effectCount;
      case 'distance': return objectData.distanceCount;
      case 'equipment': return objectData.equipmentCount;
      case 'attachments': return objectData.attachmentCount ?? 0;
      case 'hair': return objectData.hairCount;
      case 'beard': return objectData.beardCount;
      case 'market': return Array.from(appearanceToItemIds.entries()).filter(([appearanceId, itemId]) => (
        objectData.things.has(appearanceId)
        && (readItemProperty(itemDefinitions.get(itemId)?.properties, 'marketable') === true
          || readItemProperty(itemDefinitions.get(itemId)?.properties, 'marketable') === 1)
      )).length;
    }
  };

  return (
    <nav
      className="absolute left-1/2 top-0 flex h-full -translate-x-1/2 items-stretch"
      aria-label="Object library"
    >
      {CATEGORIES.filter(({ key }) => key === 'item' || key === 'market' || key === 'outfit').map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => setActiveLibrary(key)}
          className={`flex items-center gap-1.5 border-b-2 px-2.5 text-[11px] transition-colors ${
            activeLibrary === key && centerTab !== 'poseLab'
              ? 'border-emperia-accent bg-emperia-accent/10 text-emperia-accent'
              : 'border-transparent text-emperia-muted hover:bg-emperia-hover hover:text-emperia-text'
          }`}
          title={`${label}: ${getCategoryCount(key)} ${key === 'market' ? 'items' : 'objects'}`}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span>{label}</span>
          <span className="text-[9px] opacity-55">{getCategoryCount(key)}</span>
        </button>
      ))}
      {LIBRARY_GROUPS.map(({ label, keys, icon: Icon }) => {
        const options = CATEGORIES.filter(({ key }) => (keys as readonly string[]).includes(key));
        const selected = options.find(({ key }) => key === activeLibrary);
        const active = selected != null && centerTab !== 'poseLab';
        return (
          <div key={label} className={`relative flex items-center gap-1.5 border-b-2 px-2.5 text-[11px] transition-colors focus-within:ring-1 focus-within:ring-inset focus-within:ring-emperia-accent ${
            active
              ? 'border-emperia-accent bg-emperia-accent/10 text-emperia-accent'
              : 'border-transparent text-emperia-muted hover:bg-emperia-hover hover:text-emperia-text'
          }`}>
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-nowrap">
              {selected?.label ?? (keys[0] === 'effect' ? 'Effects' : 'Equipment')}
            </span>
            {selected && <span className="text-[9px] opacity-55">{getCategoryCount(selected.key)}</span>}
            <ChevronDown className="h-3 w-3 shrink-0" />
            <select
              aria-label={label}
              value={centerTab === 'poseLab' ? '' : selected?.key ?? ''}
              onChange={event => setActiveLibrary(event.target.value as LibraryCategory)}
              className="absolute inset-0 h-full w-full cursor-pointer bg-emperia-surface text-emperia-text opacity-0"
            >
              <option value="" disabled>{label}</option>
              {options.map(({ key, label: optionLabel }) => (
                <option key={key} value={key}>{optionLabel} ({getCategoryCount(key)})</option>
              ))}
            </select>
          </div>
        );
      })}
      <button
        onClick={() => setCenterTab('poseLab')}
        className={`flex items-center gap-1.5 border-b-2 px-2.5 text-[11px] transition-colors ${
          centerTab === 'poseLab'
            ? 'border-emperia-accent bg-emperia-accent/10 text-emperia-accent'
            : 'border-transparent text-emperia-muted hover:bg-emperia-hover hover:text-emperia-text'
        }`}
      >
        <Accessibility className="h-3.5 w-3.5 shrink-0" />
        <span>Pose Lab</span>
      </button>
    </nav>
  );
}
