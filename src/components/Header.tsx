import { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, CloudUpload, Download, FolderOpen, Info, Loader2, Redo2, Undo2 } from 'lucide-react';
import { useOBStore } from '../store';
import { INITIAL_COMPILE_STATE, runCompile } from '../lib/compile-pipeline';
import type { CompileState } from '../lib/compile-pipeline';
import { CompileModal } from './CompileModal';
import { LibraryTabs } from './LibraryTabs';

export function Header() {
  const objectData = useOBStore((state) => state.objectData);
  const reset = useOBStore((state) => state.reset);
  const dirty = useOBStore((state) => state.dirty);
  const undo = useOBStore((state) => state.undo);
  const redo = useOBStore((state) => state.redo);
  const undoStack = useOBStore((state) => state.undoStack);
  const redoStack = useOBStore((state) => state.redoStack);
  const markClean = useOBStore((state) => state.markClean);

  const [compile, setCompile] = useState<CompileState>(INITIAL_COMPILE_STATE);
  const [compileModalOpen, setCompileModalOpen] = useState(false);
  const [publishToCdn, setPublishToCdn] = useState(() => localStorage.getItem('publish-to-cdn') !== 'false');
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (compile.active && !compile.endTime) {
      timerRef.current = window.setInterval(() => {
        setCompile((previous) => ({
          ...previous,
          totalElapsed: performance.now() - previous.startTime,
        }));
      }, 100);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [compile.active, compile.endTime]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const handleCompile = useCallback(async () => {
    if (compile.active) return;
    setCompileModalOpen(true);
    await runCompile(setCompile, markClean, { publishToCdn });
  }, [compile.active, markClean, publishToCdn]);

  const handlePublishPreference = useCallback((enabled: boolean) => {
    setPublishToCdn(enabled);
    localStorage.setItem('publish-to-cdn', String(enabled));
  }, []);

  const handleCloseCompileModal = useCallback(() => {
    if (compile.active) return;
    setCompileModalOpen(false);
    setCompile(INITIAL_COMPILE_STATE);
  }, [compile.active]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
        event.preventDefault();
        redo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        handleCompile();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleCompile, redo, undo]);

  return (
    <>
      <div className="relative h-10 flex items-center px-3 gap-2 bg-emperia-surface border-b border-emperia-border shrink-0">
        <img
          src="/emperia-icon-purple.svg"
          alt=""
          aria-hidden="true"
          className="w-6 h-6"
        />
        <span className="text-sm font-bold text-emperia-text tracking-wide">
          Emperia Assets Editor
        </span>
        <span className="text-xs text-emperia-muted">v1.0.0</span>

        {dirty && !compile.active && (
          <span title="Unsaved changes">
            <Circle className="w-2 h-2 fill-amber-400 text-amber-400" />
          </span>
        )}

        <LibraryTabs />

        <div className="flex-1" />

        {objectData && (
          <>
            <div className="flex items-center gap-3 text-xs text-emperia-muted mr-2">
              <span className="flex items-center gap-1">
                <Info className="w-3 h-3" />
                EOBJ v{objectData.formatVersion}
              </span>
              <span>Content v{objectData.version}</span>
              <span>{objectData.things.size} objects</span>
            </div>

            <button
              onClick={undo}
              disabled={undoStack.length === 0 || compile.active}
              className="p-1.5 rounded text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover
                         disabled:opacity-30 disabled:cursor-default transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={redo}
              disabled={redoStack.length === 0 || compile.active}
              className="p-1.5 rounded text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover
                         disabled:opacity-30 disabled:cursor-default transition-colors"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-5 bg-emperia-border mx-1" />

            <label
              className="flex cursor-pointer select-none items-center gap-1.5 rounded px-2 py-1 text-[11px] text-emperia-muted hover:bg-emperia-hover hover:text-emperia-text"
              title="Publish compiled assets to the Cloudflare R2 CDN after saving"
            >
              <input
                type="checkbox"
                checked={publishToCdn}
                disabled={compile.active}
                onChange={(event) => handlePublishPreference(event.target.checked)}
                className="h-3 w-3 accent-emperia-accent"
              />
              <CloudUpload className="h-3.5 w-3.5" />
              Publish CDN
            </label>

            <button
              onClick={handleCompile}
              disabled={compile.active}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium
                         bg-emperia-accent/20 text-emperia-accent hover:bg-emperia-accent/30
                         disabled:opacity-50 disabled:cursor-default transition-colors"
              title="Compile and save all files (Ctrl+S)"
            >
              {compile.active
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Download className="w-3.5 h-3.5" />}
              {compile.active ? 'Compiling...' : 'Compile'}
            </button>
          </>
        )}

        <button
          onClick={reset}
          disabled={compile.active}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs
                     text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover
                     disabled:opacity-50 disabled:cursor-default transition-colors"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Open
        </button>
      </div>

      <CompileModal
        compile={compile}
        open={compileModalOpen}
        onClose={handleCloseCompileModal}
      />
    </>
  );
}
