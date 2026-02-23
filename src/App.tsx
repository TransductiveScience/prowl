import { useCallback, useEffect, useRef, useState } from 'react';
import { AppStateProvider, useAppState } from './hooks/useAppState';
import { DropZone } from './components/DropZone';
import { LoadingOverlay } from './components/LoadingOverlay';
import { SplashScreen } from './components/SplashScreen';
import { Header } from './components/Header';
import { GraphCanvas, GraphCanvasHandle } from './components/GraphCanvas';
import { RightPanel, RightPanelTab } from './components/RightPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { RoadmapPanel } from './components/RoadmapPanel';
import { StatusBar } from './components/StatusBar';
import { FileTreePanel } from './components/FileTreePanel';
import { CodeEditorPanel } from './components/CodeEditorPanel';
import { UpdateBanner } from './components/UpdateBanner';
import { FileEntry } from './services/zip';
import { getActiveProviderConfig } from './core/llm/settings-service';

const LAST_PROJECT_KEY = 'prowl-last-project';

const AppContent = () => {
  const {
    viewMode,
    setViewMode,
    setGraph,
    setFileContents,
    setProgress,
    setProjectName,
    progress,
    isRightPanelOpen,
    setRightPanelOpen,
    runPipeline,
    runPipelineFromFiles,
    isSettingsPanelOpen,
    setSettingsPanelOpen,
    refreshLLMSettings,
    initializeAgent,
    startEmbeddings,
    embeddingStatus,
    codeReferences,
    selectedNode,
    isCodePanelOpen,
    startAgentWatcher,
    agentWatcherState,
    setProjectPath,
    setLoadedFromSnapshot,
    loadedFromSnapshot,
    saveSnapshot,
    loadSnapshot,
    incrementalUpdate,
    projectPath: currentProjectPath,
  } = useAppState();

  const graphCanvasRef = useRef<GraphCanvasHandle>(null);
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('chat');
  const [isRoadmapOpen, setIsRoadmapOpen] = useState(false);

  /* Folder path ref for the file watcher — kept in a ref to skip re-render deps */
  const pendingFolderPathRef = useRef<string | null>(null);

  /* Key bindings — openFolder callback ref wired below after handleFolderLoad is declared */
  const openFolderRef = useRef<() => void>(() => {});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        if (isRightPanelOpen && rightPanelTab === 'terminal') {
          setRightPanelOpen(false);
        } else {
          setRightPanelOpen(true);
          setRightPanelTab('terminal');
        }
      }
      /* Cmd+O / Ctrl+O triggers folder picker */
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault();
        openFolderRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRightPanelOpen, rightPanelTab, setRightPanelOpen]);

  const handleFileSelect = useCallback(async (file: File) => {
    pendingFolderPathRef.current = null;
    const projectName = file.name.replace('.zip', '');
    setProjectName(projectName);
    setProgress({ phase: 'extracting', percent: 0, message: 'Starting...', detail: 'Preparing to extract files' });
    setViewMode('loading');

    try {
      const result = await runPipeline(file, (progress) => {
        setProgress(progress);
      });

      setGraph(result.graph);
      setFileContents(result.fileContents);
      setViewMode('exploring');

      if (getActiveProviderConfig()) {
        initializeAgent(projectName);
      }

      startEmbeddings().catch((err) => {
        if (err?.name === 'WebGPUNotAvailableError' || err?.message?.includes('WebGPU')) {
          startEmbeddings('wasm').catch(console.warn);
        } else {
          console.warn('Embeddings auto-start failed:', err);
        }
      });
    } catch (error) {
      console.error('Indexing error:', error);
      setProgress({
        phase: 'error',
        percent: 0,
        message: 'Error processing file',
        detail: error instanceof Error ? error.message : 'Unknown error',
      });
      setTimeout(() => {
        setViewMode('onboarding');
        setProgress(null);
      }, 3000);
    }
  }, [setViewMode, setGraph, setFileContents, setProgress, setProjectName, runPipeline, startEmbeddings, initializeAgent]);

  const handleGitClone = useCallback(async (files: FileEntry[]) => {
    pendingFolderPathRef.current = null;
    const firstPath = files[0]?.path || 'repository';
    const projectName = firstPath.split('/')[0].replace(/-\d+$/, '') || 'repository';

    setProjectName(projectName);
    setProgress({ phase: 'extracting', percent: 0, message: 'Starting...', detail: 'Preparing to process files' });
    setViewMode('loading');

    try {
      const result = await runPipelineFromFiles(files, (progress) => {
        setProgress(progress);
      });

      setGraph(result.graph);
      setFileContents(result.fileContents);
      setViewMode('exploring');

      if (getActiveProviderConfig()) {
        initializeAgent(projectName);
      }

      startEmbeddings().catch((err) => {
        if (err?.name === 'WebGPUNotAvailableError' || err?.message?.includes('WebGPU')) {
          startEmbeddings('wasm').catch(console.warn);
        } else {
          console.warn('Embeddings auto-start failed:', err);
        }
      });
    } catch (error) {
      console.error('Indexing error:', error);
      setProgress({
        phase: 'error',
        percent: 0,
        message: 'Error processing repository',
        detail: error instanceof Error ? error.message : 'Unknown error',
      });
      setTimeout(() => {
        setViewMode('onboarding');
        setProgress(null);
      }, 3000);
    }
  }, [setViewMode, setGraph, setFileContents, setProgress, setProjectName, runPipelineFromFiles, startEmbeddings, initializeAgent]);

  /* Local folder handler — tries snapshot restore, falls back to full pipeline, then starts the watcher */
  const handleFolderLoad = useCallback(async (files: FileEntry[], folderPath: string) => {
    pendingFolderPathRef.current = folderPath;
    setProjectPath(folderPath);
    localStorage.setItem(LAST_PROJECT_KEY, folderPath);
    const projectName = folderPath.split('/').filter(Boolean).pop() || 'project';

    setProjectName(projectName);
    setLoadedFromSnapshot(false);

    /* Look for a previously cached snapshot on disk */
    const hasSnapshot = (window as any).prowl?.snapshot
      ? await (window as any).prowl.snapshot.exists(folderPath)
      : false;

    if (hasSnapshot) {
      setProgress({ phase: 'extracting', percent: 0, message: 'Loading cached snapshot...', detail: 'Verifying integrity' });
      setViewMode('loading');

      const result = await loadSnapshot(folderPath, (progress) => {
        setProgress(progress);
      });

      if (result) {
        /* Detect files changed since the snapshot was written */
        let needsIncrementalUpdate = false;
        try {
          const prowlSnapshot = (window as any).prowl?.snapshot;
          if (prowlSnapshot) {
            const meta = await prowlSnapshot.readMeta(folderPath) as any;
            const manifest = await prowlSnapshot.readManifest(folderPath);
            if (meta && manifest) {
              const diff = await prowlSnapshot.detectChanges(folderPath, meta.gitCommit, manifest);
              const totalChanges = (diff.added?.length || 0) + (diff.modified?.length || 0) + (diff.deleted?.length || 0);
              if (totalChanges > 0) {
                needsIncrementalUpdate = true;
                setProgress({ phase: 'structure', percent: 5, message: `Updating ${totalChanges} changed files...` });

                /* Apply incremental diff via the state hook */
                const updatedResult = await incrementalUpdate(diff, folderPath, (p) => setProgress(p));

                if (updatedResult) {
                  setGraph(updatedResult.graph);
                  setFileContents(updatedResult.fileContents);
                } else {
                  /* Incremental pass failed — fall back to raw snapshot data */
                  setGraph(result.graph);
                  setFileContents(result.fileContents);
                }

                /* Persist the refreshed snapshot to disk */
                saveSnapshot(folderPath).catch(console.warn);
              }
            }
          }
        } catch (err) {
          console.warn('[prowl:snapshot] Incremental check failed:', err);
        }

        if (!needsIncrementalUpdate) {
          setGraph(result.graph);
          setFileContents(result.fileContents);
        }

        setViewMode('exploring');
        setLoadedFromSnapshot(true);

        if (getActiveProviderConfig()) {
          initializeAgent(projectName);
        }

        /* Embeddings may have been restored from the snapshot — try auto-starting if not */
        startEmbeddings().catch((err) => {
          if (err?.name === 'WebGPUNotAvailableError' || err?.message?.includes('WebGPU')) {
            startEmbeddings('wasm').catch(console.warn);
          } else {
            console.warn('Embeddings auto-start failed:', err);
          }
        });

        /* Kick off the filesystem watcher for live updates */
        startAgentWatcher(folderPath).catch((err) => {
          console.warn('Auto-watcher failed to start:', err);
        });

        return; /* snapshot path complete — skip full pipeline */
      }
      /* Snapshot restoration failed — proceed with full ingestion below */
    }

    setProgress({ phase: 'extracting', percent: 0, message: 'Starting...', detail: 'Preparing to process files' });
    setViewMode('loading');

    try {
      const result = await runPipelineFromFiles(files, (progress) => {
        setProgress(progress);
      });

      setGraph(result.graph);
      setFileContents(result.fileContents);
      setViewMode('exploring');

      if (getActiveProviderConfig()) {
        initializeAgent(projectName);
      }

      startEmbeddings().catch((err) => {
        if (err?.name === 'WebGPUNotAvailableError' || err?.message?.includes('WebGPU')) {
          startEmbeddings('wasm').catch(console.warn);
        } else {
          console.warn('Embeddings auto-start failed:', err);
        }
      });

      /* Begin watching the folder for filesystem changes */
      startAgentWatcher(folderPath).catch((err) => {
        console.warn('Auto-watcher failed to start:', err);
      });

      /* Background-save a snapshot for future fast restores */
      saveSnapshot(folderPath).catch(console.warn);
    } catch (error) {
      console.error('Indexing error:', error);
      setProgress({
        phase: 'error',
        percent: 0,
        message: 'Error processing folder',
        detail: error instanceof Error ? error.message : 'Unknown error',
      });
      setTimeout(() => {
        setViewMode('onboarding');
        setProgress(null);
      }, 3000);
    }
  }, [setViewMode, setGraph, setFileContents, setProgress, setProjectName, runPipelineFromFiles, startEmbeddings, initializeAgent, startAgentWatcher, setProjectPath, setLoadedFromSnapshot, loadSnapshot, saveSnapshot, incrementalUpdate]);

  /* Launch the native directory picker, scan the result, and start ingestion */
  const openFolder = useCallback(async () => {
    const prowl = (window as any).prowl;
    if (!prowl?.selectDirectory || !prowl?.scanFolder) return;
    const dirPath = await prowl.selectDirectory();
    if (!dirPath) return;
    try {
      const files = await prowl.scanFolder(dirPath);
      if (files.length === 0) return;
      handleFolderLoad(files, dirPath);
    } catch (err) {
      console.warn('[prowl] Folder scan failed:', err);
    }
  }, [handleFolderLoad]);

  /* Synchronise the ref so the keyboard shortcut always calls the latest callback */
  useEffect(() => {
    openFolderRef.current = openFolder;
  }, [openFolder]);

  /* Forget the last-opened project when the user navigates back to onboarding */
  useEffect(() => {
    if (viewMode === 'onboarding' && !currentProjectPath) {
      localStorage.removeItem(LAST_PROJECT_KEY);
    }
  }, [viewMode, currentProjectPath]);

  /* On cold start, re-open the most recently loaded project if one is saved */
  const startupRanRef = useRef(false);
  useEffect(() => {
    if (viewMode !== 'startup' || startupRanRef.current) return;
    startupRanRef.current = true;

    const lastPath = localStorage.getItem(LAST_PROJECT_KEY);
    const prowl = (window as any).prowl;

    if (!lastPath || !prowl?.scanFolder) {
      setViewMode('onboarding');
      return;
    }

    /* Fire-and-forget async restore */
    (async () => {
      try {
        const files: FileEntry[] = await prowl.scanFolder(lastPath);
        if (files.length === 0) {
          localStorage.removeItem(LAST_PROJECT_KEY);
          setViewMode('onboarding');
          return;
        }
        handleFolderLoad(files, lastPath);
      } catch {
        localStorage.removeItem(LAST_PROJECT_KEY);
        setViewMode('onboarding');
      }
    })();
  }, [viewMode, setViewMode, handleFolderLoad]);

  const handleFocusNode = useCallback((nodeId: string) => {
    graphCanvasRef.current?.focusNode(nodeId);
  }, []);

  const handleRefreshGraph = useCallback(() => {
    graphCanvasRef.current?.refreshGraph();
  }, []);

  const handleSettingsSaved = useCallback(() => {
    refreshLLMSettings();
    initializeAgent();
  }, [refreshLLMSettings, initializeAgent]);

  /* Route the view based on current mode */
  if (viewMode === 'startup') {
    return <SplashScreen />;
  }

  if (viewMode === 'onboarding') {
    return (
      <>
        <UpdateBanner />
        <DropZone
          onFileSelect={handleFileSelect}
          onGitClone={handleGitClone}
          onFolderLoad={handleFolderLoad}
        />
      </>
    );
  }

  if (viewMode === 'loading' && progress) {
    return <LoadingOverlay progress={progress} />;
  }

  /* Main workspace — graph + panels */
  return (
    <div className="flex flex-col h-screen bg-void overflow-hidden">
      <UpdateBanner />
      <Header
        onFocusNode={handleFocusNode}
        onRefreshGraph={handleRefreshGraph}
        onOpenRoadmap={() => setIsRoadmapOpen(true)}
        onOpenFolder={openFolder}
      />

      <main className="flex-1 flex min-h-0 overflow-hidden">
        {/* File tree sidebar */}
        <FileTreePanel onFocusNode={handleFocusNode} />

        {/* Graph viewport — fills remaining width */}
        <div className="flex-1 relative min-w-0">
          <GraphCanvas ref={graphCanvasRef} />

          {/* Floating code editor overlay */}
          {isCodePanelOpen && (codeReferences.length > 0 || !!selectedNode) && (
            <div className="absolute inset-y-2 left-2 z-30 pointer-events-auto animate-slide-in-left">
              <CodeEditorPanel onFocusNode={handleFocusNode} />
            </div>
          )}
        </div>

        {/* Tabbed side panel — chat, flows, agent, terminal */}
        {isRightPanelOpen && (
          <RightPanel
            onFocusNode={handleFocusNode}
            activeTab={rightPanelTab}
            onTabChange={setRightPanelTab}
            terminalCwd={agentWatcherState.workspacePath || pendingFolderPathRef.current || undefined}
          />
        )}
      </main>

      <StatusBar
        isTerminalOpen={isRightPanelOpen && rightPanelTab === 'terminal'}
        onTerminalToggle={() => {
          if (isRightPanelOpen && rightPanelTab === 'terminal') {
            setRightPanelOpen(false);
          } else {
            setRightPanelOpen(true);
            setRightPanelTab('terminal');
          }
        }}
      />

      {/* Provider settings modal */}
      <SettingsPanel
        isOpen={isSettingsPanelOpen}
        onClose={() => setSettingsPanelOpen(false)}
        onSettingsSaved={handleSettingsSaved}
      />

      {/* Roadmap overlay */}
      <RoadmapPanel
        isOpen={isRoadmapOpen}
        onClose={() => setIsRoadmapOpen(false)}
      />
    </div>
  );
};

function App() {
  return (
    <AppStateProvider>
      <AppContent />
    </AppStateProvider>
  );
}

export default App;
