import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  AiErrorCategory,
  AiGenerateRequest,
  AiGenerateResult,
  AiProviderTelemetry,
  AiServiceProvider,
  classifyAiErrorStatus,
  computeBackoffDelayMs,
} from '../src/utils/aiReliability.ts';

export interface SystemErrorEntry {
  id: string;
  timestamp: string;
  subsystem: 'AI_PROVIDER' | 'NASA_NTRS' | 'NASA_OSDR' | 'NASA_PSI_OPEN' | 'URL_CHECK';
  code: string;
  message: string;
}

const MAX_ERROR_LOG = 25;

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('REQUEST_ABORTED'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('REQUEST_ABORTED'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export class GeminiAiProvider implements AiServiceProvider {
  public readonly providerName = 'Google Gemini Free-Tier SDK';
  public readonly model: string;
  public readonly defaultTimeoutMs: number;
  public readonly maxRetries: number;

  private telemetry: AiProviderTelemetry;
  private recentErrors: SystemErrorEntry[] = [];

  constructor(model: string) {
    this.model = model;
    const rawTimeout = Number(process.env.GEMINI_TIMEOUT_MS);
    this.defaultTimeoutMs =
      Number.isFinite(rawTimeout) && rawTimeout >= 5000 && rawTimeout <= 60_000
        ? Math.round(rawTimeout)
        : 30_000;
    const rawRetries = Number(process.env.GEMINI_MAX_RETRIES);
    this.maxRetries =
      Number.isFinite(rawRetries) && rawRetries >= 1 && rawRetries <= 3
        ? Math.round(rawRetries)
        : 2;

    this.telemetry = {
      providerName: this.providerName,
      model,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      timeoutCount: 0,
      lastLatencyMs: null,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    };
  }

  public isConfigured(): boolean {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
  }

  public getTelemetry(): AiProviderTelemetry {
    return { ...this.telemetry };
  }

  public getRecentErrors(): SystemErrorEntry[] {
    return [...this.recentErrors];
  }

  public recordExternalError(
    subsystem: SystemErrorEntry['subsystem'],
    code: string,
    message: string
  ): void {
    this.recentErrors.unshift({
      id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      subsystem,
      code,
      message,
    });
    if (this.recentErrors.length > MAX_ERROR_LOG) {
      this.recentErrors.length = MAX_ERROR_LOG;
    }
  }

  public async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      const err = new Error('GEMINI_API_KEY_MISSING');
      throw err;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    const maxAttempts = this.maxRetries;
    const startMs = Date.now();
    this.telemetry.totalRequests += 1;

    const contents = [
      ...request.history.map((turn) => ({
        role: turn.role,
        parts: [{ text: turn.text }],
      })),
      { role: 'user' as const, parts: [{ text: request.prompt }] },
    ];

    let lastError: unknown = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (request.signal?.aborted) {
        this.recordFailure('REQUEST_ABORTED', 'Request aborted by client.');
        throw new Error('REQUEST_ABORTED');
      }

      const attemptController = new AbortController();
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        attemptController.abort();
      }, timeoutMs);

      const onOuterAbort = () => {
        attemptController.abort();
      };
      request.signal?.addEventListener('abort', onOuterAbort, { once: true });

      try {
        const response = await ai.models.generateContent({
          model: this.model,
          contents,
          config: {
            systemInstruction: request.systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            abortSignal: attemptController.signal,
          },
        });

        clearTimeout(timer);
        request.signal?.removeEventListener('abort', onOuterAbort);

        const text = (response.text ?? '').trim();
        if (!text) {
          this.recordFailure('EMPTY_AI_RESPONSE', 'Gemini returned empty text.');
          throw new Error('EMPTY_AI_RESPONSE');
        }

        const latencyMs = Date.now() - startMs;
        this.telemetry.successfulRequests += 1;
        this.telemetry.lastLatencyMs = latencyMs;
        this.telemetry.lastSuccessAt = new Date().toISOString();

        return {
          text,
          model: this.model,
          providerName: this.providerName,
          latencyMs,
          attempts: attempt + 1,
        };
      } catch (err: unknown) {
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', onOuterAbort);

        if (request.signal?.aborted) {
          this.recordFailure('REQUEST_ABORTED', 'Client disconnected or cancelled request.');
          throw new Error('REQUEST_ABORTED');
        }

        if (timedOut) {
          lastError = new Error('GEMINI_TIMEOUT');
        } else {
          lastError = err;
        }

        const classified = classifyAiErrorStatus(lastError);
        const canRetry =
          attempt + 1 < maxAttempts &&
          classified.retryable &&
          classified.errorCode !== 'GEMINI_TIMEOUT';

        if (!canRetry) {
          if (classified.errorCode === 'GEMINI_TIMEOUT') {
            this.telemetry.timeoutCount += 1;
          }
          this.recordFailure(classified.errorCode, classified.userMessage);
          throw lastError;
        }

        const baseBackoff = computeBackoffDelayMs(attempt, 650);
        const jitterMs = Math.round(Math.random() * 250);
        await sleepWithAbort(baseBackoff + jitterMs, request.signal);
      }
    }

    throw lastError ?? new Error('GEMINI_UPSTREAM_ERROR');
  }

  private recordFailure(code: AiErrorCategory, message: string): void {
    this.telemetry.failedRequests += 1;
    this.telemetry.lastErrorAt = new Date().toISOString();
    this.telemetry.lastErrorCode = code;
    this.telemetry.lastErrorMessage = message;
    this.recordExternalError('AI_PROVIDER', code, message);
  }
}
