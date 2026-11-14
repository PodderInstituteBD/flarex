export type AiAnswerMode = 'grounded' | 'document' | 'local';

export type AiErrorCategory =
  | 'INVALID_INPUT'
  | 'GEMINI_TIMEOUT'
  | 'QUOTA_EXHAUSTED'
  | 'API_KEY_INVALID'
  | 'MODEL_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'REQUEST_ABORTED'
  | 'GEMINI_API_KEY_MISSING'
  | 'EMPTY_AI_RESPONSE'
  | 'GEMINI_UPSTREAM_ERROR';

export interface AiProviderTelemetry {
  providerName: string;
  model: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  timeoutCount: number;
  lastLatencyMs: number | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: AiErrorCategory | null;
  lastErrorMessage: string | null;
}

export interface AiGenerateRequest {
  systemInstruction: string;
  history: Array<{ role: 'user' | 'model'; text: string }>;
  prompt: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AiGenerateResult {
  text: string;
  model: string;
  providerName: string;
  latencyMs: number;
  attempts: number;
}

/** Provider-independent abstraction so FLAREX can swap or add providers without rewriting UI routes. */
export interface AiServiceProvider {
  readonly providerName: string;
  readonly model: string;
  isConfigured(): boolean;
  generate(request: AiGenerateRequest): Promise<AiGenerateResult>;
}

export function classifyAiErrorStatus(err: unknown): {
  httpStatus: number;
  errorCode: AiErrorCategory;
  userMessage: string;
  retryable: boolean;
} {
  const errObj = err as { status?: number; message?: string; name?: string };
  const status = errObj?.status;
  const msg = errObj?.message ?? '';

  if (errObj?.name === 'AbortError' || msg === 'REQUEST_ABORTED') {
    return {
      httpStatus: 499,
      errorCode: 'REQUEST_ABORTED',
      userMessage: 'AI request was cancelled before completion.',
      retryable: false,
    };
  }
  if (msg === 'GEMINI_TIMEOUT') {
    return {
      httpStatus: 504,
      errorCode: 'GEMINI_TIMEOUT',
      userMessage:
        'Live Gemini request timed out after 30 seconds. Switch to Local Brief Mode (non-generative) or retry.',
      retryable: true,
    };
  }
  if (status === 429 || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
    return {
      httpStatus: 429,
      errorCode: 'QUOTA_EXHAUSTED',
      userMessage:
        'Gemini API quota is exhausted (429 RESOURCE_EXHAUSTED). Wait briefly before retrying, or use Local Brief Mode.',
      retryable: false,
    };
  }
  if (
    status === 401 ||
    status === 403 ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('API_KEY_INVALID')
  ) {
    return {
      httpStatus: 403,
      errorCode: 'API_KEY_INVALID',
      userMessage:
        'Configured server API key was rejected by Gemini. Verify GEMINI_API_KEY in Settings > Secrets.',
      retryable: false,
    };
  }
  if (status === 404 || msg.includes('NOT_FOUND')) {
    return {
      httpStatus: 404,
      errorCode: 'MODEL_NOT_FOUND',
      userMessage:
        'Configured Gemini model was not found. Verify GEMINI_MODEL matches a supported free-tier model.',
      retryable: false,
    };
  }

  const retryable = status === 500 || status === 502 || status === 503 || status === undefined;
  return {
    httpStatus: 502,
    errorCode: 'GEMINI_UPSTREAM_ERROR',
    userMessage:
      'AI provider returned an upstream error. FLAREX Local Brief Mode and investigation tools remain fully operational.',
    retryable,
  };
}

export function computeBackoffDelayMs(attemptIndex: number, baseMs = 600): number {
  const exp = baseMs * 2 ** Math.max(0, attemptIndex);
  return Math.min(4000, exp);
}
