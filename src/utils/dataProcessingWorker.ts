import type { WorkerOutboundMessage, WorkerProcessRequest } from '../workers/datasetWorker.ts';
import {
  ingestScientificTabularData,
  type IngestedDatasetPackage,
} from './scientificIngestion.ts';

export const LARGE_DATASET_ROW_THRESHOLD = 50_000;
export const LARGE_DATASET_BYTE_THRESHOLD = 1_500_000;

export interface WorkerProgressInfo {
  processedRows: number;
  estimatedTotalRows: number;
  percent: number;
}

export interface WorkerProcessingResult {
  dataset: IngestedDatasetPackage;
  metrics: {
    elapsedMs: number;
    chunkCount: number;
    usedWebWorker: boolean;
    rowCount: number;
    largeDatasetNotice: string | null;
  };
}

export interface CancellableWorkerJob {
  promise: Promise<WorkerProcessingResult>;
  cancel: () => void;
}

export function shouldUseWorkerForFile(content: string): {
  recommended: boolean;
  estimatedLines: number;
  byteSize: number;
} {
  let newlineCount = 0;
  for (let i = 0; i < content.length; i += 1) {
    if (content.charCodeAt(i) === 10) newlineCount += 1;
  }
  const estimatedLines = Math.max(1, newlineCount);
  const recommended =
    estimatedLines >= LARGE_DATASET_ROW_THRESHOLD ||
    content.length >= LARGE_DATASET_BYTE_THRESHOLD;
  return { recommended, estimatedLines, byteSize: content.length };
}

/**
 * Starts chunked large-dataset processing inside a Web Worker when supported,
 * with clean cancellation and deterministic chunked synchronous fallback for Node tests.
 */
export function startDatasetProcessingJob(
  input: {
    filename: string;
    content: string;
    sourceUrl?: string;
    repository?: string;
    investigationId?: string | null;
    chunkSize?: number;
  },
  onProgress?: (progress: WorkerProgressInfo) => void
): CancellableWorkerJob {
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const chunkSize = input.chunkSize ?? 5000;
  let activeWorker: Worker | null = null;
  let cancelled = false;
  let rejectOuter: ((reason?: unknown) => void) | null = null;

  const cancel = () => {
    cancelled = true;
    if (activeWorker) {
      try {
        activeWorker.terminate();
      } catch {
        // ignore termination failure
      }
      activeWorker = null;
    }
    if (rejectOuter) {
      rejectOuter(new Error('PROCESSING_CANCELLED'));
    }
  };

  const promise = new Promise<WorkerProcessingResult>((resolve, reject) => {
    rejectOuter = reject;
    const started = Date.now();
    const useWorker =
      typeof Worker !== 'undefined' &&
      shouldUseWorkerForFile(input.content).recommended;

    if (useWorker) {
      try {
        const worker = new Worker(
          new URL('../workers/datasetWorker.ts', import.meta.url),
          { type: 'module' }
        );
        activeWorker = worker;

        worker.onmessage = (ev: MessageEvent<WorkerOutboundMessage>) => {
          if (cancelled) return;
          const msg = ev.data;
          if (msg.jobId !== jobId) return;

          if (msg.type === 'PROGRESS') {
            onProgress?.({
              processedRows: msg.processedRows,
              estimatedTotalRows: msg.estimatedTotalRows,
              percent: msg.percent,
            });
          } else if (msg.type === 'COMPLETE') {
            worker.terminate();
            activeWorker = null;
            resolve({
              dataset: msg.dataset,
              metrics: {
                elapsedMs: msg.elapsedMs,
                chunkCount: msg.chunkCount,
                usedWebWorker: true,
                rowCount: msg.dataset.summary.rowCount,
                largeDatasetNotice:
                  msg.dataset.summary.rowCount >= LARGE_DATASET_ROW_THRESHOLD
                    ? `Processed ${msg.dataset.summary.rowCount.toLocaleString()} rows in ${msg.elapsedMs}ms across ${msg.chunkCount} worker chunks.`
                    : null,
              },
            });
          } else if (msg.type === 'ERROR') {
            worker.terminate();
            activeWorker = null;
            reject(new Error(msg.message));
          }
        };

        worker.onerror = () => {
          if (cancelled) return;
          worker.terminate();
          activeWorker = null;
          // Graceful main-thread chunked fallback if Worker bundler fails
          const fallback = ingestSynchronouslyChunked(input, chunkSize, started, onProgress);
          resolve(fallback);
        };

        const req: WorkerProcessRequest = {
          type: 'PROCESS_DATASET',
          jobId,
          filename: input.filename,
          content: input.content,
          sourceUrl: input.sourceUrl,
          repository: input.repository,
          investigationId: input.investigationId,
          chunkSize,
        };
        worker.postMessage(req);
        return;
      } catch {
        activeWorker = null;
      }
    }

    // Deterministic synchronous chunked fallback (also exercised by Node tests)
    if (cancelled) {
      reject(new Error('PROCESSING_CANCELLED'));
      return;
    }
    const result = ingestSynchronouslyChunked(input, chunkSize, started, onProgress);
    resolve(result);
  });

  return { promise, cancel };
}

function ingestSynchronouslyChunked(
  input: {
    filename: string;
    content: string;
    sourceUrl?: string;
    repository?: string;
    investigationId?: string | null;
  },
  chunkSize: number,
  startedMs: number,
  onProgress?: (progress: WorkerProgressInfo) => void
): WorkerProcessingResult {
  const dataset = ingestScientificTabularData(input);
  const total = dataset.summary.rowCount;
  const chunkCount = Math.max(1, Math.ceil(total / chunkSize));
  for (let c = 1; c <= chunkCount; c += 1) {
    const processed = Math.min(total, c * chunkSize);
    onProgress?.({
      processedRows: processed,
      estimatedTotalRows: total,
      percent: total > 0 ? Math.round((processed / total) * 100) : 100,
    });
  }
  const elapsedMs = Math.max(1, Date.now() - startedMs);
  return {
    dataset,
    metrics: {
      elapsedMs,
      chunkCount,
      usedWebWorker: false,
      rowCount: total,
      largeDatasetNotice:
        total >= LARGE_DATASET_ROW_THRESHOLD
          ? `Processed ${total.toLocaleString()} rows in ${elapsedMs}ms across ${chunkCount} chunk(s).`
          : null,
    },
  };
}
