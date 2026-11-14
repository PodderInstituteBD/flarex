import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express, { NextFunction, Request, Response } from 'express';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { InvestigationRecord } from './src/types/research.ts';
import { validateResearchDatabase } from './src/utils/databaseValidator.ts';
import { retrieveRelevantInvestigations } from './src/utils/researchLogic.ts';

const PORT = Number(process.env.PORT || 3000);
function resolveGeminiModel(): string {
  const raw = process.env.GEMINI_MODEL?.trim() ?? '';
  if (/^gemini-[a-z0-9.-]+$/i.test(raw) && raw.length <= 48) {
    return raw;
  }
  return 'gemini-4-hydrogen';
}
const GEMINI_MODEL = resolveGeminiModel();

interface RawDatabaseFile {
  databaseTitle: string;
  sourceDocument: string;
  sourceDocumentTitle: string;
  records: InvestigationRecord[];
}

function loadResearchRecords(): InvestigationRecord[] {
  const dbPath = path.join(process.cwd(), 'src', 'data', 'researchDatabase.json');
  const raw = fs.readFileSync(dbPath, 'utf-8');
  const parsed = JSON.parse(raw) as RawDatabaseFile;
  return parsed.records ?? [];
}

const researchRecords = loadResearchRecords();
const dbAudit = validateResearchDatabase(researchRecords);

// Simple in-memory TTL cache for public NASA repository lookups (NTRS & OSDR)
interface ApiCacheEntry {
  expiresAt: number;
  data: unknown;
}
const ntrsCache = new Map<string, ApiCacheEntry>();
const osdrCache = new Map<string, ApiCacheEntry>();
const urlCheckCache = new Map<string, ApiCacheEntry>();
const NASA_CACHE_TTL_MS = 15 * 60 * 1000;

function isSafePublicHttpsUrl(rawUrl: string): { valid: boolean; parsed?: URL } {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return { valid: false };
    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return { valid: false };
    }
    return { valid: true, parsed };
  } catch {
    return { valid: false };
  }
}

// Simple sliding-window rate limiter per IP for /api/assistant
const rateWindowMap = new Map<string, number[]>();
function isRateLimited(ip: string, maxRequests = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const timestamps = (rateWindowMap.get(ip) ?? []).filter(
    (ts) => now - ts < windowMs
  );
  if (timestamps.length >= maxRequests) {
    rateWindowMap.set(ip, timestamps);
    return true;
  }
  timestamps.push(now);
  rateWindowMap.set(ip, timestamps);
  return false;
}

function buildCompactContext(records: InvestigationRecord[]): string {
  return records
    .map((r) => {
      const quant =
        r.quantitativeData.length > 0
          ? r.quantitativeData
              .map((q) => `${q.label}: ${q.valueDisplay} (${q.kind})`)
              .join('; ')
          : 'None in loaded database';
      const pubs =
        r.publications && r.publications.length > 0
          ? r.publications
              .map((p) => `${p.title} (${p.journal}, ${p.date}, DOI: ${p.doi})`)
              .join('; ')
          : null;
      return [
        `ID: ${r.id}`,
        `Name: ${r.name}`,
        `Family: ${r.family}`,
        `Evidence Classification: ${r.evidenceType}`,
        `Platform & Gravity: ${r.platform} | ${r.gravityContext} | isMicrogravity=${r.isMicrogravity} | isPlannedOrOngoing=${r.isPlannedOrOngoing}`,
        `Timeframe: ${r.timeframe}`,
        `PSI ID: ${r.psiId ?? 'Not listed'}`,
        r.ntrsDocumentId
          ? `NTRS ID: ${r.ntrsDocumentId}${r.reportNumber ? ` (${r.reportNumber})` : ''}`
          : null,
        r.principalInvestigator ? `Investigators: ${r.principalInvestigator}` : null,
        r.authors && r.authors.length > 0 ? `Authors: ${r.authors.join(', ')}` : null,
        `DOI: ${r.doi ?? 'Not listed in database'}`,
        pubs ? `Publications: ${pubs}` : null,
        `Primary Source URL: ${r.sourceUrl}`,
        `Source Label: ${r.sourceLabel}`,
        `Data Availability: ${r.dataAvailabilityLabel}`,
        `Overview: ${r.overview}`,
        `Fuels/Materials: ${r.fuels.join(', ')}${r.materialsAndGeometry ? ` | ${r.materialsAndGeometry}` : ''}`,
        `Reported Findings: ${r.reportedFindings ?? 'None published yet'}`,
        `Published Quantitative Figures/Ranges: ${quant}`,
        `Limitations: ${r.limitations.join(' ; ')}`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n---\n\n');
}

const FLAREX_SYSTEM_INSTRUCTION = `You are FLAREX Research Intelligence, an AI research assistant for an independent student-built NASA Space Apps Challenge platform exploring microgravity combustion research.

STRICT SCIENTIFIC INTEGRITY RULES:
1. Use ONLY the provided retrieved FLAREX dossier records as your primary factual source. Never invent numerical measurements, experimental outcomes, DOIs, PSI dataset IDs, paper titles, or NASA endorsements.
2. Always structure your response into two clearly labeled sections:
   - **Documented Dossier Facts** (citing exact investigation names, PSI IDs if present, and original source URLs from the retrieved records)
   - **AI Interpretation & Synthesis** (explaining concepts, comparing conditions, or highlighting limitations/research gaps clearly marked as AI interpretation)
3. If the retrieved evidence is insufficient to answer a question, explicitly state that the loaded research dossier does not contain that evidence.
4. Never claim a study proves something when the source only describes an objective or hypothesis.
5. Never confuse planned/in-progress experiments (such as SoFIE-MIST, SoFIE-OFFS, or unlaunched ACME CLD/Flame Design/s-Flame) with completed experimental results.
6. Never treat NASA/UL Li-ion battery fire tests as microgravity data — they are strictly ground-based terrestrial 1g tests (no in-flight microgravity battery fire data exists).
7. Never describe ACME E-FIELD Flames as direct partial-gravity testing — it studies electrostatic ion winds up to 10 kV in microgravity.
8. Be concise, accurate, and accessible to students, educators, and combustion researchers.`;

async function createServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  // Baseline security headers (preserving iframe preview compatibility)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()'
    );
    next();
  });

  // Serve public assets explicitly (including attached dossier PDF, favicon, robots.txt, sitemap.xml)
  app.use(express.static(path.join(process.cwd(), 'public')));

  app.get('/api/health', (_req, res) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    const isPlaceholder = !apiKey || apiKey === 'MY_GEMINI_API_KEY';
    res.json({
      ok: true,
      aiConfigured: !isPlaceholder,
      model: GEMINI_MODEL,
      recordCount: researchRecords.length,
      integrityPassed: dbAudit.allPassedIntegrityChecks,
      averageCompletenessPct: dbAudit.averageCompletenessPct,
    });
  });

  app.get('/api/ntrs/search', async (req, res) => {
    const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!rawQuery || rawQuery.length < 2 || rawQuery.length > 140) {
      res.status(400).json({
        error: 'INVALID_QUERY',
        message: 'Query parameter "q" must be between 2 and 140 characters.',
      });
      return;
    }

    const cacheKey = rawQuery.toLowerCase();
    const cached = ntrsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json({ cached: true, results: cached.data });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const ntrsUrl = `https://ntrs.nasa.gov/api/citations/search?q=${encodeURIComponent(
        rawQuery
      )}&page[size]=8`;
      const upstream = await fetch(ntrsUrl, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!upstream.ok) {
        res.status(502).json({
          error: 'NTRS_UPSTREAM_ERROR',
          message: `NASA NTRS API returned HTTP ${upstream.status}. You can search directly at https://ntrs.nasa.gov/`,
        });
        return;
      }

      const payload = (await upstream.json()) as {
        results?: Array<{
          id?: number;
          title?: string;
          publicationYear?: number;
          distributionDate?: string;
          reportNumber?: string;
          otherIds?: Array<{ type?: string; value?: string }>;
          publications?: Array<{ publicationDate?: string; doi?: string }>;
          authorAffiliations?: Array<{
            meta?: { author?: { name?: string }; organization?: { name?: string } };
          }>;
          abstract?: string;
          stiType?: string;
          center?: { name?: string };
        }>;
      };

      const normalized = (payload.results ?? []).slice(0, 8).map((item) => {
        const rawDate =
          item.publications?.[0]?.publicationDate ??
          item.distributionDate ??
          '';
        const parsedYear =
          typeof item.publicationYear === 'number'
            ? item.publicationYear
            : /^\d{4}/.test(rawDate)
            ? Number(rawDate.slice(0, 4))
            : null;
        const authors = (item.authorAffiliations ?? [])
          .map((a) => a.meta?.author?.name?.trim())
          .filter((name): name is string => Boolean(name))
          .slice(0, 5);
        const doiFromOther = (item.otherIds ?? []).find(
          (oid) => oid.type?.toLowerCase() === 'doi' && oid.value
        )?.value;
        const doi = item.publications?.[0]?.doi ?? doiFromOther ?? null;
        const reportFromOther = (item.otherIds ?? []).find(
          (oid) =>
            (oid.type?.toLowerCase().includes('report') ||
              oid.type?.toLowerCase().includes('document')) &&
            oid.value
        )?.value;
        const reportNumber = item.reportNumber ?? reportFromOther ?? null;
        const abstractSnippet =
          typeof item.abstract === 'string' && item.abstract.trim().length > 0
            ? item.abstract.trim().slice(0, 240) +
              (item.abstract.trim().length > 240 ? '…' : '')
            : null;

        return {
          id: item.id ?? null,
          title: item.title ?? 'Untitled NTRS Record',
          publicationYear: parsedYear,
          publicationDate: rawDate ? rawDate.slice(0, 10) : null,
          stiType: item.stiType ?? 'Technical Document',
          center: item.center?.name ?? null,
          authors,
          doi,
          reportNumber,
          abstractSnippet,
          url: item.id
            ? `https://ntrs.nasa.gov/citations/${item.id}`
            : 'https://ntrs.nasa.gov/',
        };
      });

      if (ntrsCache.size >= 50) {
        const oldestKey = ntrsCache.keys().next().value;
        if (oldestKey) ntrsCache.delete(oldestKey);
      }
      ntrsCache.set(cacheKey, {
        expiresAt: Date.now() + NASA_CACHE_TTL_MS,
        data: normalized,
      });

      res.json({ cached: false, results: normalized });
    } catch {
      clearTimeout(timeout);
      res.status(504).json({
        error: 'NTRS_UNREACHABLE',
        message:
          'Unable to reach NASA NTRS API from this runtime environment. Open https://ntrs.nasa.gov/ directly in your browser.',
      });
    }
  });

  app.get('/api/osdr/search', async (req, res) => {
    const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!rawQuery || rawQuery.length < 2 || rawQuery.length > 100) {
      res.status(400).json({
        error: 'INVALID_QUERY',
        message: 'Query parameter "q" must be between 2 and 100 characters.',
      });
      return;
    }

    const cacheKey = rawQuery.toLowerCase();
    const cached = osdrCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json({ cached: true, ...((cached.data as object) || {}) });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const osdrUrl = `https://osdr.nasa.gov/osdr/data/search?term=${encodeURIComponent(
        rawQuery
      )}&size=5`;
      const upstream = await fetch(osdrUrl, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!upstream.ok) {
        res.status(502).json({
          error: 'OSDR_UPSTREAM_ERROR',
          message: `NASA OSDR API returned HTTP ${upstream.status}. Open https://osdr.nasa.gov/ directly.`,
        });
        return;
      }

      const payload = (await upstream.json()) as {
        hits?: {
          total?: number;
          hits?: Array<{
            _id?: string;
            _source?: {
              Accession?: string;
              'Study Title'?: string;
              'Study Assay Measurement Type'?: string;
              'Material Type'?: string;
              organism?: string;
            };
          }>;
        };
      };

      const total = payload.hits?.total ?? 0;
      const results = (payload.hits?.hits ?? []).slice(0, 5).map((hit) => {
        const src = hit._source ?? {};
        const accession = src.Accession || hit._id || 'OSDR Record';
        return {
          id: accession,
          title: src['Study Title'] || accession,
          assayType: src['Study Assay Measurement Type'] || 'Biological / Omics Study',
          organism: src.organism || src['Material Type'] || null,
          url: `https://osdr.nasa.gov/bio/repo/search?q=${encodeURIComponent(accession)}`,
        };
      });

      const responseData = { total, results };
      if (osdrCache.size >= 40) {
        const oldestKey = osdrCache.keys().next().value;
        if (oldestKey) osdrCache.delete(oldestKey);
      }
      osdrCache.set(cacheKey, {
        expiresAt: Date.now() + NASA_CACHE_TTL_MS,
        data: responseData,
      });

      res.json({ cached: false, ...responseData });
    } catch {
      clearTimeout(timeout);
      res.status(504).json({
        error: 'OSDR_UNREACHABLE',
        message:
          'Unable to reach NASA OSDR API from this runtime environment. Open https://osdr.nasa.gov/ directly.',
      });
    }
  });

  app.post('/api/check-url', async (req, res) => {
    const body = req.body as { urls?: unknown; url?: unknown };
    const rawList: string[] = Array.isArray(body.urls)
      ? body.urls.filter((u): u is string => typeof u === 'string').slice(0, 10)
      : typeof body.url === 'string'
      ? [body.url]
      : [];

    if (rawList.length === 0) {
      res.status(400).json({
        error: 'INVALID_URL_LIST',
        message: 'Provide "url" or an array "urls" (max 10 HTTPS URLs).',
      });
      return;
    }

    const results = await Promise.all(
      rawList.map(async (targetUrl) => {
        const check = isSafePublicHttpsUrl(targetUrl);
        const now = new Date().toISOString();
        if (!check.valid || !check.parsed) {
          return {
            url: targetUrl,
            ok: false,
            status: null,
            checkedAt: now,
            note: 'Blocked non-HTTPS or private/internal host.',
          };
        }

        const cached = urlCheckCache.get(targetUrl);
        if (cached && cached.expiresAt > Date.now()) {
          return { ...(cached.data as object), cached: true };
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4500);
        try {
          let resp = await fetch(check.parsed.toString(), {
            method: 'HEAD',
            redirect: 'follow',
            signal: controller.signal,
            headers: { 'User-Agent': 'FLAREX-Link-Validator/1.0' },
          });
          if (resp.status === 405 || resp.status === 403 || resp.status === 501) {
            resp = await fetch(check.parsed.toString(), {
              method: 'GET',
              redirect: 'follow',
              signal: controller.signal,
              headers: { 'User-Agent': 'FLAREX-Link-Validator/1.0' },
            });
          }
          clearTimeout(timer);
          const outcome = {
            url: targetUrl,
            ok: resp.status >= 200 && resp.status < 400,
            status: resp.status,
            checkedAt: now,
            note:
              resp.status >= 200 && resp.status < 400
                ? 'HTTP reachable'
                : `Returned HTTP ${resp.status}`,
          };
          if (urlCheckCache.size >= 80) {
            const oldest = urlCheckCache.keys().next().value;
            if (oldest) urlCheckCache.delete(oldest);
          }
          urlCheckCache.set(targetUrl, {
            expiresAt: Date.now() + NASA_CACHE_TTL_MS,
            data: outcome,
          });
          return outcome;
        } catch {
          clearTimeout(timer);
          return {
            url: targetUrl,
            ok: false,
            status: null,
            checkedAt: now,
            note: 'Request timed out or upstream host unreachable from server.',
          };
        }
      })
    );

    res.json({ results });
  });

  app.post('/api/assistant', async (req, res) => {
    const clientIp = req.ip || 'local';
    if (isRateLimited(clientIp)) {
      res.status(429).json({
        error: 'RATE_LIMITED',
        message: 'Too many assistant requests. Please wait a moment before sending another question.',
      });
      return;
    }

    const body = req.body as {
      message?: unknown;
      history?: unknown;
      focusInvestigationId?: unknown;
      analysisMode?: unknown;
    };

    if (typeof body.message !== 'string') {
      res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'A text question ("message") is required.',
      });
      return;
    }

    const question = body.message.trim();
    if (question.length < 2 || question.length > 1500) {
      res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'Question must be between 2 and 1,500 characters.',
      });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({
        error: 'GEMINI_API_KEY_MISSING',
        message:
          'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets (or .env) to enable FLAREX Research Intelligence. All local investigation exploration, comparison, and data audit tools remain fully functional.',
      });
      return;
    }

    // Retrieve only relevant records (bounded context)
    let relevantRecords = retrieveRelevantInvestigations(
      question,
      researchRecords,
      4
    );

    if (typeof body.focusInvestigationId === 'string' && body.focusInvestigationId) {
      const focused = researchRecords.find(
        (r) => r.id === body.focusInvestigationId
      );
      if (focused && !relevantRecords.some((r) => r.id === focused.id)) {
        relevantRecords = [focused, ...relevantRecords.slice(0, 3)];
      }
    }

    const modeHintMap: Record<string, string> = {
      concept: 'Explain experimental concepts, methodology, hardware, and documented findings cleanly for students and researchers.',
      comparison: 'Perform a structured cross-study comparison highlighting differences in fuels, airflow, platform scale, and gravity compatibility warnings.',
      evidence: 'Audit evidence maturity (flight telemetry vs. descriptive overview vs. planned vs. terrestrial 1g) and state explicit limitations.',
      outline: 'Generate a concise structured literature-review outline and 3 grounded open research questions labeled as potential gaps in reviewed FLAREX sources.',
    };
    const modeKey = typeof body.analysisMode === 'string' ? body.analysisMode : 'concept';
    const modeInstruction = modeHintMap[modeKey] ?? modeHintMap.concept;

    const contextBlock = buildCompactContext(relevantRecords);
    const promptInput = `ANALYSIS MODE (${modeKey}): ${modeInstruction}\n\nUSER QUESTION:\n${question}\n\nRETRIEVED RELEVANT DOSSIER RECORDS (${relevantRecords.length} of ${researchRecords.length} total records):\n${contextBlock}`;

    const sanitizedHistory = Array.isArray(body.history)
      ? body.history
          .filter(
            (turn): turn is { role: 'user' | 'model'; text: string } =>
              Boolean(turn) &&
              typeof turn === 'object' &&
              ((turn as { role?: unknown }).role === 'user' ||
                (turn as { role?: unknown }).role === 'model') &&
              typeof (turn as { text?: unknown }).text === 'string' &&
              (turn as { text: string }).text.trim().length > 0
          )
          .slice(-6)
          .map((turn) => ({
            role: turn.role,
            parts: [{ text: turn.text.slice(0, 1200) }],
          }))
      : [];

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const contents = [
        ...sanitizedHistory,
        { role: 'user' as const, parts: [{ text: promptInput }] },
      ];

      const response = await Promise.race([
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents,
          config: {
            systemInstruction: FLAREX_SYSTEM_INSTRUCTION,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), 25_000)
        ),
      ]);

      const answerText = (response.text ?? '').trim();

      if (!answerText) {
        res.status(502).json({
          error: 'EMPTY_AI_RESPONSE',
          message:
            'The Gemini model returned an empty response. Please rephrase your question or retry.',
        });
        return;
      }

      res.json({
        answer: answerText,
        model: GEMINI_MODEL,
        retrievedSources: relevantRecords.map((r) => ({
          id: r.id,
          shortName: r.shortName,
          name: r.name,
          evidenceType: r.evidenceType,
          psiId: r.psiId,
          sourceUrl: r.sourceUrl,
        })),
      });
    } catch (err: unknown) {
      const errorObj = err as { status?: number; message?: string };
      const msg = errorObj?.message ?? 'Unknown Gemini API error';
      const status = errorObj?.status;

      if (msg === 'GEMINI_TIMEOUT') {
        res.status(504).json({
          error: 'GEMINI_TIMEOUT',
          message:
            'The Gemini API request timed out after 25 seconds. Please retry or use FLAREX local search and comparison tools.',
        });
        return;
      }

      if (status === 429 || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
        res.status(429).json({
          error: 'QUOTA_EXHAUSTED',
          message:
            'Gemini API quota is exhausted (429 RESOURCE_EXHAUSTED). Please wait a moment and retry, or check quota in Settings > Secrets.',
        });
        return;
      }

      if (
        status === 403 ||
        status === 401 ||
        msg.includes('PERMISSION_DENIED') ||
        msg.includes('API_KEY_INVALID')
      ) {
        res.status(403).json({
          error: 'API_KEY_INVALID',
          message:
            'Gemini API rejected the configured server API key. Verify GEMINI_API_KEY in Settings > Secrets.',
        });
        return;
      }

      if (status === 404 || msg.includes('NOT_FOUND')) {
        res.status(404).json({
          error: 'MODEL_NOT_FOUND',
          message: `Configured Gemini model "${GEMINI_MODEL}" was not found. Check GEMINI_MODEL environment configuration.`,
        });
        return;
      }

      res.status(502).json({
        error: 'GEMINI_UPSTREAM_ERROR',
        message: 'AI request failed due to an upstream error. FLAREX local exploration tools remain unaffected.',
      });
    }
  });

  // Consistent JSON 404 for unknown API endpoints
  app.use('/api', (_req, res) => {
    res.status(404).json({
      error: 'API_ROUTE_NOT_FOUND',
      message: 'Requested FLAREX API route does not exist.',
    });
  });

  // Centralized error handler (prevents leaking stack traces or internal secrets)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status =
      typeof (err as { status?: unknown })?.status === 'number'
        ? (err as { status: number }).status
        : 500;
    res.status(status).json({
      error: 'INTERNAL_SERVER_ERROR',
      message:
        status === 400
          ? 'Malformed request payload.'
          : 'An unexpected server error occurred.',
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `FLAREX server listening on http://0.0.0.0:${PORT} (model: ${GEMINI_MODEL})`
    );
  });
}

createServer().catch((err) => {
  console.error('Failed to start FLAREX server:', err);
  process.exit(1);
});
