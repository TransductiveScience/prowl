import { Brain, Loader2, Check, AlertCircle, Zap, FlaskConical } from 'lucide-react';
import { useAppState } from '../hooks/useAppState';
import { useState, type ReactNode } from 'react';
import { WebGPUFallbackDialog } from './WebGPUFallbackDialog';

/* ── Shared sub-components ──────────────────────────── */

function ProgressIndicator({ percent, barColor }: { percent: number; barColor: string }) {
  return (
    <div className="w-24 h-1 bg-elevated rounded-full overflow-hidden">
      <div
        className={`h-full ${barColor} rounded-full transition-all duration-300`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function StatusBadge({
  children,
  borderColor,
  bgColor,
}: {
  children: ReactNode;
  borderColor: string;
  bgColor?: string;
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 ${bgColor ?? 'bg-surface'} border ${borderColor} rounded-lg text-sm`}>
      {children}
    </div>
  );
}

/* ── Per-status view builders ───────────────────────── */

function idleView(
  onStart: () => void,
  onTest: () => void,
  testOutput: string | null,
) {
  return (
    <div className="flex items-center gap-2">
      {import.meta.env.DEV && (
        <button
          onClick={onTest}
          className="flex items-center gap-1 px-2 py-1.5 bg-surface border border-border-subtle rounded-lg text-xs text-text-muted hover:bg-hover hover:text-text-secondary transition-all"
          title="Run KuzuDB array parameter diagnostic"
        >
          <FlaskConical className="w-3 h-3" />
          {testOutput || 'Test'}
        </button>
      )}
      <button
        onClick={onStart}
        className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border-subtle rounded-lg text-sm text-text-secondary hover:bg-hover hover:text-text-primary hover:border-accent/50 transition-all group"
        title="Build vector index for search"
      >
        <Brain className="w-4 h-4 text-node-interface group-hover:text-accent transition-colors" />
        <span className="hidden sm:inline">Enable Semantic Search</span>
        <Zap className="w-3 h-3 text-text-muted" />
      </button>
    </div>
  );
}

function loadingView(downloadPct: number) {
  return (
    <StatusBadge borderColor="border-accent/30">
      <Loader2 className="w-4 h-4 text-accent animate-spin" />
      <div className="flex flex-col gap-0.5">
        <span className="text-text-secondary text-xs">Loading AI model...</span>
        <ProgressIndicator percent={downloadPct} barColor="bg-accent" />
      </div>
    </StatusBadge>
  );
}

function embeddingView(done: number, total: number, pct: number) {
  return (
    <StatusBadge borderColor="border-node-function/30">
      <Loader2 className="w-4 h-4 text-node-function animate-spin" />
      <div className="flex flex-col gap-0.5">
        <span className="text-text-secondary text-xs">
          Embedding {done}/{total} nodes
        </span>
        <ProgressIndicator percent={pct} barColor="bg-node-function" />
      </div>
    </StatusBadge>
  );
}

function indexingView() {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-node-interface/30 rounded-lg text-sm text-text-secondary">
      <Loader2 className="w-4 h-4 text-node-interface animate-spin" />
      <span className="text-xs">Creating vector index...</span>
    </div>
  );
}

function readyView() {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 bg-violet-500/10 border border-violet-500/30 rounded-md text-sm text-violet-300"
      title="Vector index built. Use natural language in the AI chat."
    >
      <Check className="w-3.5 h-3.5" />
      <span className="text-xs font-medium">Vectors Active</span>
    </div>
  );
}

function errorView(onRetry: () => void, errMsg?: string) {
  return (
    <button
      onClick={onRetry}
      className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 hover:bg-red-500/20 transition-colors"
      title={errMsg || 'Indexing failed. Click to retry.'}
    >
      <AlertCircle className="w-4 h-4" />
      <span className="text-xs">Failed - Retry</span>
    </button>
  );
}

/* ── Main component ─────────────────────────────────── */

export const EmbeddingStatus = () => {
  const {
    embeddingStatus,
    embeddingProgress,
    startEmbeddings,
    graph,
    viewMode,
    testArrayParams,
  } = useAppState();

  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);

  if (viewMode !== 'exploring' || !graph) return null;

  const totalNodes = graph.nodes.length;

  const launchEmbeddings = async (device?: 'webgpu' | 'wasm') => {
    try {
      await startEmbeddings(device);
    } catch (err: any) {
      if (err?.name === 'WebGPUNotAvailableError' || err?.message?.includes('WebGPU not available')) {
        setShowFallback(true);
      } else {
        console.error('Embedding failed:', err);
      }
    }
  };

  const handleCpuFallback = () => {
    setShowFallback(false);
    launchEmbeddings('wasm');
  };

  const handleSkipFallback = () => { setShowFallback(false); };

  const runArrayTest = async () => {
    setTestOutput('Testing...');
    const result = await testArrayParams();
    if (result.success) {
      setTestOutput('Array params OK');
    } else {
      setTestOutput(`Failed: ${result.error}`);
      console.error('[prowl:embedding] array params test failed:', result.error);
    }
  };

  const dialog = (
    <WebGPUFallbackDialog
      isOpen={showFallback}
      onClose={() => setShowFallback(false)}
      onUseCPU={handleCpuFallback}
      onSkip={handleSkipFallback}
      nodeCount={totalNodes}
    />
  );

  const viewForStatus: Record<string, () => ReactNode> = {
    idle: () => idleView(() => launchEmbeddings(), runArrayTest, testOutput),
    loading: () => loadingView(embeddingProgress?.modelDownloadPercent ?? 0),
    embedding: () => embeddingView(
      embeddingProgress?.nodesProcessed ?? 0,
      embeddingProgress?.totalNodes ?? 0,
      embeddingProgress?.percent ?? 0,
    ),
    indexing: indexingView,
    ready: readyView,
    error: () => errorView(() => launchEmbeddings(), embeddingProgress?.error),
  };

  const render = viewForStatus[embeddingStatus];
  if (!render) return null;

  const content = render();
  const showDialog = embeddingStatus === 'idle' || embeddingStatus === 'loading' || embeddingStatus === 'error';

  if (showDialog) {
    return <>{content}{dialog}</>;
  }

  return <>{content}</>;
};
