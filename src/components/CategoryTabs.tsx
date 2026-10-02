import { Search, Plus, Minus, Trash2, Grid2X2 } from 'lucide-react';
import { useMemo } from 'react';
import { useOBStore, getDisplayId } from '../store';
import { getEquipmentClassification } from '../lib/item-properties';

const GROUP_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Ground',
  2: 'Container',
  3: 'Weapon',
  4: 'Ammunition',
  5: 'Armor',
  6: 'Charges',
  7: 'Teleport',
  9: 'Write',
  10: 'Write Once',
  11: 'Fluid',
  12: 'Splash',
};

export function CategoryTabs() {
  const activeCategory = useOBStore((s) => s.activeCategory);
  const activeLibrary = useOBStore((s) => s.activeLibrary);
  const objectData = useOBStore((s) => s.objectData);
  const searchQuery = useOBStore((s) => s.searchQuery);
  const setSearchQuery = useOBStore((s) => s.setSearchQuery);
  const selectedThingId = useOBStore((s) => s.selectedThingId);
  const addThing = useOBStore((s) => s.addThing);
  const removeThing = useOBStore((s) => s.removeThing);
  const clearThings = useOBStore((s) => s.clearThings);
  const getCategoryRange = useOBStore((s) => s.getCategoryRange);
  const filterGroup = useOBStore((s) => s.filterGroup);
  const setFilterGroup = useOBStore((s) => s.setFilterGroup);
  const equipmentFilter = useOBStore((s) => s.equipmentFilter);
  const marketSort = useOBStore((s) => s.marketSort);
  const setEquipmentFilter = useOBStore((s) => s.setEquipmentFilter);
  const itemDefinitions = useOBStore((s) => s.itemDefinitions);
  const libraryColumns = useOBStore((s) => s.libraryColumns);
  const setLibraryColumns = useOBStore((s) => s.setLibraryColumns);
  const definitionsLoaded = useOBStore((s) => s.definitionsLoaded);
  const selectedThingIds = useOBStore((s) => s.selectedThingIds);
  useOBStore((s) => s.editVersion);

  const selCount = selectedThingIds.size;
  const equipmentFilterOptions = useMemo(() => {
    const options = new Map<string, ReturnType<typeof getEquipmentClassification>>();
    for (const itemId of objectData?.equipmentAppearances.keys() ?? []) {
      const classification = getEquipmentClassification(itemDefinitions.get(itemId)?.properties);
      if (classification) options.set(classification.key, classification);
    }
    return Array.from(options.values())
      .filter((option): option is NonNullable<typeof option> => option != null)
      .sort((left, right) => (
        left.kind.localeCompare(right.kind) || left.label.localeCompare(right.label)
      ));
  }, [objectData, itemDefinitions]);

  return (
    <div className="shrink-0">
      {/* Row 1: Search */}
      <div className="px-2 py-1.5 border-b border-emperia-border flex items-center gap-1">
        {definitionsLoaded && (activeLibrary === 'item' || activeLibrary === 'market') && (
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(parseInt(e.target.value, 10))}
            className="text-[10px] bg-emperia-surface border border-emperia-border rounded px-1 py-1 text-emperia-text outline-none cursor-pointer max-w-[80px] shrink-0"
            title="Filter by group"
          >
            <option value={-1}>All</option>
            {Object.entries(GROUP_LABELS).map(([g, label]) => (
              <option key={g} value={g}>{label}</option>
            ))}
          </select>
        )}
        {activeLibrary === 'market' && (
          <select
            value={marketSort}
            onChange={(event) => useOBStore.setState({ marketSort: event.target.value as typeof marketSort })}
            className="text-[10px] bg-emperia-surface border border-emperia-border rounded px-1 py-1 text-emperia-text outline-none cursor-pointer max-w-[85px] shrink-0"
            aria-label="Sort Market items"
          >
            <option value="id">ID</option>
            <option value="name">Name</option>
            <option value="group">Group</option>
          </select>
        )}
        {definitionsLoaded && activeLibrary === 'equipment' && (
          <select
            value={equipmentFilter}
            onChange={(e) => setEquipmentFilter(e.target.value)}
            className="text-[10px] bg-emperia-surface border border-emperia-border rounded px-1 py-1 text-emperia-text outline-none cursor-pointer max-w-[105px] shrink-0"
            title="Filter by linked item classification"
            aria-label="Equipment classification filter"
          >
            <option value="all">All</option>
            {equipmentFilterOptions.some((option) => option.kind === 'weapon') && (
              <optgroup label="Weapon type">
                {equipmentFilterOptions
                  .filter((option) => option.kind === 'weapon')
                  .map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </optgroup>
            )}
            {equipmentFilterOptions.some((option) => option.kind === 'slot') && (
              <optgroup label="Slot">
                {equipmentFilterOptions
                  .filter((option) => option.kind === 'slot')
                  .map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </optgroup>
            )}
            <option value="unlinked">Unlinked</option>
          </select>
        )}
        <div className="flex items-center gap-1.5 bg-emperia-surface rounded px-2 py-1 flex-1">
          <Search className="w-3.5 h-3.5 text-emperia-muted shrink-0" />
          <input
            type="text"
            placeholder={definitionsLoaded ? 'Search by ID or name…' : 'Search by ID…'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs text-emperia-text placeholder-emperia-muted/50 outline-none w-full"
          />
          {selCount > 0 && (
            <span className="text-[10px] text-emperia-accent font-medium shrink-0">{selCount} sel</span>
          )}
        </div>
      </div>
      {/* Row 2: Actions */}
      <div className="px-2 py-1 border-b border-emperia-border flex items-center gap-1">
        <label
          className="flex items-center gap-1 rounded border border-emperia-border bg-emperia-surface px-1 text-emperia-muted"
          title="Number of columns in the object library"
        >
          <Grid2X2 className="h-3.5 w-3.5 shrink-0" />
          <select
            value={libraryColumns}
            onChange={(e) => setLibraryColumns(Number(e.target.value))}
            className="cursor-pointer bg-emperia-surface py-1 text-[10px] text-emperia-text outline-none"
            style={{ colorScheme: 'dark' }}
            aria-label="Library columns"
          >
            {[2, 3, 4, 5, 6].map((columns) => (
              <option
                key={columns}
                value={columns}
                className="bg-emperia-surface text-emperia-text"
              >
                {columns}
              </option>
            ))}
          </select>
        </label>
        {activeLibrary !== 'market' && (
          <>
            <button
              onClick={() => addThing(activeCategory)}
              disabled={!objectData}
              className="p-1 rounded bg-emperia-surface border border-emperia-border text-emperia-muted hover:text-green-400 hover:border-green-400/50 disabled:opacity-30 transition-colors"
              title={`Add new ${activeCategory}`}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (!selectedThingId || !objectData) return;
                const selectedIds = selectedThingIds.size > 0
                  ? Array.from(selectedThingIds)
                  : [selectedThingId];
                if (selectedIds.length === 1) {
                  const dId = getDisplayId(objectData, selectedIds[0]);
                  if (confirm(`Clear ${activeCategory} #${dId}? This will strip all sprites, properties, and flags but keep the slot.`)) {
                    clearThings(selectedIds);
                  }
                } else if (confirm(`Clear ${selectedIds.length} selected ${activeCategory} slots? This will strip all sprites, properties, and flags but keep the slots.`)) {
                  clearThings(selectedIds);
                }
              }}
              disabled={!objectData || !selectedThingId}
              className="p-1 rounded bg-emperia-surface border border-emperia-border text-emperia-muted hover:text-red-400 hover:border-red-400/50 disabled:opacity-30 transition-colors"
              title={`Clear selected ${activeCategory}${selCount > 1 ? ` slots (${selCount})` : ''} (keep slots)`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (!selectedThingId || !objectData) return;
                const range = getCategoryRange(activeCategory);
                if (!range || selectedThingId !== range.end) return;
                const dId = objectData ? getDisplayId(objectData, selectedThingId) : selectedThingId;
                if (confirm(`Remove ${activeCategory} #${dId}? Only the last entry can be removed.`)) {
                  removeThing(selectedThingId);
                }
              }}
              disabled={!objectData || !selectedThingId || (() => { const r = getCategoryRange(activeCategory); return !r || selectedThingId !== r.end; })()}
              className="p-1 rounded bg-emperia-surface border border-emperia-border text-emperia-muted hover:text-orange-400 hover:border-orange-400/50 disabled:opacity-30 transition-colors"
              title={`Remove last ${activeCategory}`}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
