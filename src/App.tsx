import { useEffect, useRef, useState } from 'react';
import { useOBStore, getDisplayId } from './store';
import { attachmentLibraryStart, migrateAttachmentLibrary } from './lib/attachment-library';
import { FileDropZone } from './components/FileDropZone';
import { Header } from './components/Header';
import { CategoryTabs } from './components/CategoryTabs';
import { ThingGrid } from './components/ThingGrid';
import { SpritePreview } from './components/SpritePreview';
import { PropertyInspector } from './components/PropertyInspector';
import { ServerPropertiesEditor } from './components/ServerPropertiesEditor';
import { ThingSpriteGrid } from './components/ThingSpriteGrid';
import { ObjectSlots } from './components/ObjectSlots';
import { LayerPanel } from './components/LayerPanel';
import { EquipmentCatalogEditor } from './components/EquipmentCatalogEditor';
import { AttachmentCatalogEditor } from './components/AttachmentCatalogEditor';
import { HairEditor } from './components/HairEditor';
import { BeardEditor } from './components/BeardEditor';
import { PoseLab } from './components/PoseLab';
import { LocalizationEditor } from './components/LocalizationEditor';

type ItemTab = 'texture' | 'properties' | 'localization';

const TAB_LABELS: Record<ItemTab, string> = {
  texture: 'Texture',
  properties: 'Properties',
  localization: 'Localization',
} as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getSavedPanelWidth = (key: string, fallback: number, min: number, max: number): number => {
  if (typeof localStorage === 'undefined') return fallback;
  const saved = localStorage.getItem(key);
  if (saved == null || saved.trim() === '') return fallback;
  const stored = Number(saved);
  return Number.isFinite(stored) ? clamp(stored, min, max) : fallback;
};

type ResizeTarget = 'left' | 'right' | 'objectSprites';

function ResizeHandle({ onPointerDown, label }: {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  label: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title="Drag to resize"
      onPointerDown={onPointerDown}
      className="group relative z-20 w-1.5 shrink-0 cursor-col-resize touch-none"
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-emperia-border transition-colors group-hover:w-0.5 group-hover:bg-emperia-accent" />
    </div>
  );
}

function SelectedItemBadge() {
  const selectedId = useOBStore((s) => s.selectedThingId);
  const objectData = useOBStore((s) => s.objectData);
  const appearanceToItemIds = useOBStore((s) => s.appearanceToItemIds);
  useOBStore((s) => s.editVersion);

  const thing = selectedId != null ? objectData?.things.get(selectedId) ?? null : null;
  if (!thing || !objectData) return null;

  const displayId = getDisplayId(objectData, thing.id);
  const itemId = thing.category === 'item'
    ? (appearanceToItemIds.get(thing.id) ?? displayId)
    : displayId;

  return (
    <div className="flex items-center gap-3 text-[11px] font-mono">
      <span className="flex items-center gap-1.5">
        <span className="text-emperia-muted">{thing.category === 'item' ? 'Item ID' : 'ID'}</span>
        <span className="text-cyan-400 font-semibold">{itemId}</span>
      </span>
      <span className="text-emperia-muted/60 capitalize text-[10px]">{thing.category}</span>
    </div>
  );
}

export default function App() {
  const loaded = useOBStore((s) => s.loaded);
  const centerTab = useOBStore((s) => s.centerTab);
  const activeLibrary = useOBStore((s) => s.activeLibrary);
  const setCenterTab = useOBStore((s) => s.setCenterTab);
  const migrationData = useOBStore((s) => s.objectData);
  useEffect(() => {
    if (!migrationData) return;
    const migrated = migrateAttachmentLibrary(migrationData);
    if (migrated === migrationData) return;
    const current = useOBStore.getState();
    if (current.objectData !== migrationData) return;
    const sourceStart = migrationData.itemCount + migrationData.outfitCount + 75;
    const remapId = (id: number) => id >= sourceStart && id < sourceStart + 3
      ? attachmentLibraryStart(migrated) + id - sourceStart + 1
      : id >= sourceStart + 3 ? id - 3 : id;
    const selectedThingId = current.selectedThingId == null ? null : remapId(current.selectedThingId);
    const selectedCategory = selectedThingId == null ? undefined : migrated.things.get(selectedThingId)?.category;
    useOBStore.setState({
      objectData: migrated, dirty: true, editVersion: current.editVersion + 1,
      dirtyIds: new Set(Array.from(current.dirtyIds, remapId)),
      selectedThingId, selectedThingIds: new Set(Array.from(current.selectedThingIds, remapId)),
      ...(selectedCategory === 'attachments' ? { activeCategory: 'attachments', activeLibrary: 'attachments' } : {}),
    });
  }, [migrationData]);
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => (
    getSavedPanelWidth('emperia-ob-left-panel-width', 256, 200, 520)
  ));
  const [rightPanelWidth, setRightPanelWidth] = useState(() => (
    getSavedPanelWidth('emperia-ob-right-panel-width', 288, 220, 640)
  ));
  const [objectSpritesPanelWidth, setObjectSpritesPanelWidth] = useState(() => (
    getSavedPanelWidth('emperia-ob-object-sprites-panel-width', 340, 240, 600)
  ));
  const resizeRef = useRef<{
    target: ResizeTarget;
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    localStorage.setItem('emperia-ob-left-panel-width', String(leftPanelWidth));
  }, [leftPanelWidth]);

  useEffect(() => {
    localStorage.setItem('emperia-ob-right-panel-width', String(rightPanelWidth));
  }, [rightPanelWidth]);

  useEffect(() => {
    localStorage.setItem('emperia-ob-object-sprites-panel-width', String(objectSpritesPanelWidth));
  }, [objectSpritesPanelWidth]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resize = resizeRef.current;
      if (!resize) return;
      const delta = event.clientX - resize.startX;
      if (resize.target === 'left') {
        setLeftPanelWidth(clamp(resize.startWidth + delta, 200, 520));
      } else if (resize.target === 'objectSprites') {
        setObjectSpritesPanelWidth(clamp(resize.startWidth - delta, 240, 600));
      } else {
        setRightPanelWidth(clamp(resize.startWidth - delta, 220, 640));
      }
    };
    const handlePointerUp = () => {
      if (!resizeRef.current) return;
      resizeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  useEffect(() => {
    const blurPointerActivatedCheckbox = (event: MouseEvent) => {
      // Keyboard-triggered clicks have no click count. Keep focus for keyboard users.
      if (event.detail === 0 || !(event.target instanceof Element)) return;

      const checkbox = event.target instanceof HTMLInputElement && event.target.type === 'checkbox'
        ? event.target
        : event.target.closest('label')?.querySelector<HTMLInputElement>('input[type="checkbox"]');

      if (!checkbox) return;

      // Label clicks move focus as a default browser action after this event dispatches.
      requestAnimationFrame(() => checkbox.blur());
    };

    document.addEventListener('click', blurPointerActivatedCheckbox, true);
    return () => document.removeEventListener('click', blurPointerActivatedCheckbox, true);
  }, []);

  const beginResize = (
    target: ResizeTarget,
    width: number,
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    resizeRef.current = { target, startX: event.clientX, startWidth: width };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  if (!loaded) {
    return <FileDropZone />;
  }

  return (
    <div className="h-full flex flex-col">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Category tabs + item grid */}
        <div
          className="shrink-0 flex flex-col bg-emperia-bg"
          style={{ width: leftPanelWidth }}
        >
          <CategoryTabs />
          <ThingGrid />
        </div>
        <ResizeHandle
          label="Resize object library"
          onPointerDown={(event) => beginResize('left', leftPanelWidth, event)}
        />

        {/* Center: category editor and item sub-tabs */}
        <div className="flex-1 flex flex-col bg-emperia-bg overflow-hidden">
          {activeLibrary === 'item' && centerTab !== 'poseLab' && (
            <div className="flex items-center border-b border-emperia-border shrink-0">
              {(['texture', 'properties', 'localization'] as ItemTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setCenterTab(tab)}
                  className={`px-4 py-2 text-xs font-medium transition-colors
                    ${centerTab === tab
                      ? 'text-emperia-accent border-b-2 border-emperia-accent'
                      : 'text-emperia-muted hover:text-emperia-text'
                    }
                  `}
                >
                  {TAB_LABELS[tab]}
                </button>
              ))}
              <div className="flex-1" />
              <div className="pr-3">
                <SelectedItemBadge />
              </div>
            </div>
          )}
          {activeLibrary === 'equipment' && centerTab !== 'poseLab' && (
            <div className="flex items-center border-b border-emperia-border shrink-0">
              {([
                { key: 'equipment', label: 'Equipment' },
                { key: 'texture', label: 'Equipment Textures' },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setCenterTab(tab.key)}
                  className={`px-4 py-2 text-xs font-medium transition-colors ${
                    centerTab === tab.key
                      ? 'text-emperia-accent border-b-2 border-emperia-accent'
                      : 'text-emperia-muted hover:text-emperia-text'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              <div className="flex-1" />
              <div className="pr-3">
                <SelectedItemBadge />
              </div>
            </div>
          )}
          {(activeLibrary === 'hair' || activeLibrary === 'beard' || activeLibrary === 'attachments') && centerTab !== 'poseLab' && (
            <div className="flex items-center border-b border-emperia-border shrink-0">
              {([
                { key: activeLibrary, label: 'Information' },
                { key: 'texture', label: 'Texture' },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setCenterTab(tab.key)}
                  className={`px-4 py-2 text-xs font-medium transition-colors ${
                    centerTab === tab.key
                      ? 'text-emperia-accent border-b-2 border-emperia-accent'
                      : 'text-emperia-muted hover:text-emperia-text'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              <div className="flex-1" />
              <div className="pr-3">
                <SelectedItemBadge />
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {centerTab === 'texture' && <SpritePreview />}
            {activeLibrary === 'item' && centerTab === 'properties' && <PropertyInspector />}
            {activeLibrary === 'market' && centerTab === 'properties' && (
              <div className="p-4">
                <ServerPropertiesEditor mode="availability" />
              </div>
            )}
            {activeLibrary === 'item' && centerTab === 'localization' && <LocalizationEditor />}
            {activeLibrary === 'equipment' && centerTab === 'equipment' && <EquipmentCatalogEditor />}
            {activeLibrary === 'attachments' && centerTab === 'attachments' && <AttachmentCatalogEditor />}
            {activeLibrary === 'hair' && centerTab === 'hair' && <HairEditor />}
            {activeLibrary === 'beard' && centerTab === 'beard' && <BeardEditor />}
            {centerTab === 'poseLab' && <PoseLab />}
          </div>
        </div>

        {/* Middle-right: Object sprite slots + layer/offset/colors */}
        <ResizeHandle
          label="Resize object sprites"
          onPointerDown={(event) => beginResize('objectSprites', objectSpritesPanelWidth, event)}
        />
        <div
          className="shrink-0 bg-emperia-bg overflow-y-auto flex flex-col"
          style={{ width: objectSpritesPanelWidth }}
        >
          <ObjectSlots />
          <LayerPanel />
        </div>

        {/* Right: Sprite atlas browser */}
        <ResizeHandle
          label="Resize sprite atlas"
          onPointerDown={(event) => beginResize('right', rightPanelWidth, event)}
        />
        <div
          className="shrink-0 bg-emperia-bg flex flex-col"
          style={{ width: rightPanelWidth }}
        >
          <ThingSpriteGrid />
        </div>
      </div>
    </div>
  );
}
