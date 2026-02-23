import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { DEFAULT_EMBEDDING_CONFIG, type EmbeddingConfig, type ModelProgress } from './types';

/* ── Runtime singleton ───────────────────────────────── */

const runtime = {
  instance: null as FeatureExtractionPipeline | null,
  loading: false,
  pending: null as Promise<FeatureExtractionPipeline> | null,
  activeDevice: null as 'webgpu' | 'wasm' | null,
};

/* ── Types ───────────────────────────────────────────── */

export type ModelProgressCallback = (progress: ModelProgress) => void;

export class WebGPUNotAvailableError extends Error {
  constructor(originalError?: Error) {
    super('WebGPU not available in this browser');
    this.name = 'WebGPUNotAvailableError';
    this.cause = originalError;
  }
}

/* ── GPU capability test ─────────────────────────────── */

async function testGPUCapability(): Promise<boolean> {
  try {
    const nav = navigator as any;
    if (!nav.gpu) return false;
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) return false;
    const gpuDevice = await adapter.requestDevice();
    gpuDevice.destroy();
    return true;
  } catch {
    return false;
  }
}

export const checkWebGPUAvailability = testGPUCapability;

/* ── Device accessor ─────────────────────────────────── */

export function getCurrentDevice(): 'webgpu' | 'wasm' | null {
  return runtime.activeDevice;
}

/* ── Environment setup ───────────────────────────────── */

function setupEnv(): void {
  env.allowLocalModels = false;
  env.logLevel = 'error';
  env.useBrowserCache = true;
}

function bridgeProgressCb(
  onProgress?: ModelProgressCallback,
): ((data: any) => void) | undefined {
  if (!onProgress) return undefined;
  return (data: any) => {
    onProgress({
      status: data.status || 'progress',
      file: data.file,
      progress: data.progress,
      loaded: data.loaded,
      total: data.total,
    });
  };
}

async function instantiatePipeline(
  modelId: string,
  device: 'webgpu' | 'wasm',
  progressCb?: (data: any) => void,
): Promise<FeatureExtractionPipeline> {
  return await (pipeline as any)(
    'feature-extraction',
    modelId,
    {
      device,
      dtype: 'fp32',
      progress_callback: progressCb,
    },
  );
}

/* ── Backend boot helpers ────────────────────────────── */

async function bootWithGPU(
  modelId: string,
  progressCb?: (data: any) => void,
): Promise<FeatureExtractionPipeline> {
  if (import.meta.env.DEV) {
    console.log('[prowl:embedder] probing WebGPU support');
  }

  const gpuOk = await testGPUCapability();

  if (!gpuOk) {
    if (import.meta.env.DEV) {
      console.warn('[prowl:embedder] WebGPU unavailable on this device');
    }
    runtime.loading = false;
    runtime.pending = null;
    throw new WebGPUNotAvailableError();
  }

  try {
    if (import.meta.env.DEV) {
      console.log('[prowl:embedder] starting WebGPU backend');
    }
    const inst = await instantiatePipeline(modelId, 'webgpu', progressCb);
    runtime.activeDevice = 'webgpu';
    if (import.meta.env.DEV) {
      console.log('[prowl:embedder] WebGPU backend active');
    }
    return inst;
  } catch (gpuErr) {
    if (import.meta.env.DEV) {
      console.warn('[prowl:embedder] WebGPU boot failed:', gpuErr);
    }
    runtime.loading = false;
    runtime.pending = null;
    runtime.instance = null;
    throw new WebGPUNotAvailableError(gpuErr as Error);
  }
}

async function bootWithWasm(
  modelId: string,
  progressCb?: (data: any) => void,
): Promise<FeatureExtractionPipeline> {
  if (import.meta.env.DEV) {
    console.log('[prowl:embedder] starting WASM backend');
  }
  const inst = await instantiatePipeline(modelId, 'wasm', progressCb);
  runtime.activeDevice = 'wasm';
  if (import.meta.env.DEV) {
    console.log('[prowl:embedder] WASM backend active');
  }
  return inst;
}

/* ── Model initialisation ────────────────────────────── */

export async function initEmbedder(
  onProgress?: ModelProgressCallback,
  config: Partial<EmbeddingConfig> = {},
  forceDevice?: 'webgpu' | 'wasm',
): Promise<FeatureExtractionPipeline> {
  if (runtime.instance) return runtime.instance;

  if (runtime.loading && runtime.pending) return runtime.pending;

  runtime.loading = true;

  const merged = { ...DEFAULT_EMBEDDING_CONFIG, ...config };
  const targetDevice = forceDevice || merged.device;

  runtime.pending = (async () => {
    try {
      setupEnv();

      if (import.meta.env.DEV) {
        console.log(`[prowl:embedder] fetching model: ${merged.modelId}`);
      }

      const wrappedCb = bridgeProgressCb(onProgress);

      if (targetDevice === 'webgpu') {
        runtime.instance = await bootWithGPU(merged.modelId, wrappedCb);
      } else {
        runtime.instance = await bootWithWasm(merged.modelId, wrappedCb);
      }

      if (import.meta.env.DEV) {
        console.log('[prowl:embedder] model ready');
      }

      return runtime.instance!;
    } catch (err) {
      if (err instanceof WebGPUNotAvailableError) throw err;
      runtime.loading = false;
      runtime.pending = null;
      runtime.instance = null;
      throw err;
    } finally {
      runtime.loading = false;
    }
  })();

  return runtime.pending;
}

/* ── Status checks ───────────────────────────────────── */

export function isEmbedderReady(): boolean {
  return runtime.instance !== null;
}

export function getEmbedder(): FeatureExtractionPipeline {
  if (!runtime.instance) {
    throw new Error('Embedding pipeline not ready. Initialize with initEmbedder() before use.');
  }
  return runtime.instance;
}

/* ── Single-text embedding ───────────────────────────── */

export async function embedText(text: string): Promise<Float32Array> {
  const emb = getEmbedder();
  const tensor = await emb(text, { pooling: 'mean', normalize: true });
  return new Float32Array(tensor.data as ArrayLike<number>);
}

/* ── Batch embedding ─────────────────────────────────── */

export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];

  const emb = getEmbedder();
  const tensor = await emb(texts, { pooling: 'mean', normalize: true });

  const rawData = tensor.data as ArrayLike<number>;
  const dim = DEFAULT_EMBEDDING_CONFIG.dimensions;
  const vectors: Float32Array[] = [];

  for (let i = 0; i < texts.length; i++) {
    const offset = i * dim;
    vectors.push(new Float32Array(Array.prototype.slice.call(rawData, offset, offset + dim)));
  }

  return vectors;
}

/* ── Conversion helper ───────────────────────────────── */

export function embeddingToArray(embedding: Float32Array): number[] {
  return Array.from(embedding);
}

/* ── Teardown ────────────────────────────────────────── */

export async function disposeEmbedder(): Promise<void> {
  if (runtime.instance) {
    try {
      if ('dispose' in runtime.instance && typeof runtime.instance.dispose === 'function') {
        await runtime.instance.dispose();
      }
    } catch {
      /* non-fatal disposal failure */
    }
    runtime.instance = null;
    runtime.pending = null;
  }
}
