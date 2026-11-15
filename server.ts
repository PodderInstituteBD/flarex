import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express, { NextFunction, Request, Response } from 'express';
import { GeminiAiProvider } from './server/geminiProvider.ts';
import type { InvestigationRecord } from './src/types/research.ts';
import { classifyAiErrorStatus } from './src/utils/aiReliability.ts';
import { validateResearchDatabase } from './src/utils/databaseValidator.ts';
import {
  buildRetrievedSourceRefs,
  runAdvancedRagRetrieval,
  validateCitations,
} from './src/utils/ragPipeline.ts';

const PORT = Number(process.env.PORT || 3000);
function resolveGeminiModel(): string {
  const raw = process.env.GEMINI_MODEL?.trim() ?? '';
  if (/^gemini-[a-z0-9.-]+$/i.test(raw) && raw.length <= 48) {
    return raw;
  }
  return 'gemini-4-hydrogen';
}
const GEMINI_MODEL = resolveGeminiModel();
const geminiProvider = new GeminiAiProvider(GEMINI_MODEL);

interface RawDatabaseFile {
  databaseTitle: string;
  sourceDocument: string;
  sourceDocumentTitle: string;
  records: InvestigationRecord[];
}

function loadResearchDatabase(): RawDatabaseFile {
  const dbPath = path.join(process.cwd(), 'src', 'data', 'researchDatabase.json');
  const raw = fs.readFileSync(dbPath, 'utf-8');
  return JSON.parse(raw) as RawDatabaseFile;
}

const rawDatabase = loadResearchDatabase();
const researchRecords = rawDatabase.records ?? [];
const dbAudit = validateResearchDatabase(researchRecords);

// Simple in-memory TTL cache for public NASA repository lookups (NTRS, OSDR, PSI AWS S3)
interface ApiCacheEntry {
  expiresAt: number;
  data: unknown;
}
const ntrsCache = new Map<string, ApiCacheEntry>();
const osdrCache = new Map<string, ApiCacheEntry>();
const psiOpenCache = new Map<string, ApiCacheEntry>();
const urlCheckCache = new Map<string, ApiCacheEntry>();
const NASA_CACHE_TTL_MS = 15 * 60 * 1000;

function extractXmlTags(xml: string, tag: string): string[] {
  const out: string[] = [];
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    out.push(match[1].trim());
  }
  return out;
}

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
1. Use ONLY the provided retrieved FLAREX dossier records (and attached source document if in Document Analysis Mode) as your primary factual source. Never invent numerical measurements, experimental outcomes, DOIs, PSI dataset IDs, paper titles, or NASA endorsements.
2. Always organize your response into these 6 clearly labeled sections:
   1. **Direct answer** (concise factual answer grounded in retrieved evidence; state explicitly if insufficient)
   2. **Supporting evidence** (exact dossier facts, PSI/NTRS/DOI identifiers, and direct URLs from retrieved records)
   3. **Relevant investigations** (which retrieved investigations apply and their gravity/platform scope)
   4. **Scientific interpretation** (clearly labeled AI-generated synthesis/explanation of mechanisms or cross-study context)
   5. **Limitations & uncertainty warnings** (explicitly distinguish 0g vs 1g, E-FIELD electrostatic ion wind vs partial gravity, bench scale vs vehicle scale, and planned vs completed studies)
   6. **References** (list only verified source labels and URLs from the retrieved records)
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
    res.json({
      ok: true,
      aiConfigured: geminiProvider.isConfigured(),
      model: GEMINI_MODEL,
      databaseTitle: rawDatabase.databaseTitle,
      sourceDocumentTitle: rawDatabase.sourceDocumentTitle,
      recordCount: researchRecords.length,
      withPsiIdCount: researchRecords.filter((r) => Boolean(r.psiId)).length,
      withRawDatasetCount: researchRecords.filter((r) => r.hasRawNumericalDataset).length,
      integrityPassed: dbAudit.allPassedIntegrityChecks,
      averageCompletenessPct: dbAudit.averageCompletenessPct,
    });
  });

  app.get('/api/system-health', (_req, res) => {
    res.json({
      ok: true,
      serverTimestamp: new Date().toISOString(),
      database: {
        title: rawDatabase.databaseTitle,
        totalRecords: dbAudit.totalRecords,
        integrityPassed: dbAudit.allPassedIntegrityChecks,
        duplicateIdCount: dbAudit.duplicateIds.length,
        averageCompletenessPct: dbAudit.averageCompletenessPct,
        withPsiIdCount: researchRecords.filter((r) => Boolean(r.psiId)).length,
        withRawDatasetCount: researchRecords.filter((r) => r.hasRawNumericalDataset).length,
      },
      aiProvider: {
        configured: geminiProvider.isConfigured(),
        telemetry: geminiProvider.getTelemetry(),
      },
      nasaIntegration: {
        ntrsCacheEntries: ntrsCache.size,
        osdrCacheEntries: osdrCache.size,
        psiOpenCacheEntries: psiOpenCache.size,
        urlCheckCacheEntries: urlCheckCache.size,
      },
      recentErrors: geminiProvider.getRecentErrors(),
    });
  });

  app.get('/api/psi-open/browse', async (req, res) => {
    const rawPrefix = typeof req.query.prefix === 'string' ? req.query.prefix.trim() : '';
    if (rawPrefix.length > 120 || /[^a-zA-Z0-9_./-]/.test(rawPrefix)) {
      res.status(400).json({
        error: 'INVALID_PREFIX',
        message: 'Prefix must contain only safe alphanumeric, /, -, _, or . characters.',
      });
      return;
    }

    const cacheKey = `prefix:${rawPrefix}`;
    const cached = psiOpenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json({ cached: true, ...((cached.data as object) || {}) });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    try {
      const s3Url = `https://nasa-psi.s3.us-west-2.amazonaws.com/?list-type=2&delimiter=/&max-keys=50${
        rawPrefix ? `&prefix=${encodeURIComponent(rawPrefix)}` : ''
      }`;
      const upstream = await fetch(s3Url, { signal: controller.signal });
      clearTimeout(timer);

      if (!upstream.ok) {
        geminiProvider.recordExternalError(
          'NASA_PSI_OPEN',
          `HTTP_${upstream.status}`,
          `NASA PSI Open AWS S3 returned HTTP ${upstream.status}`
        );
        res.status(502).json({
          error: 'PSI_OPEN_UPSTREAM_ERROR',
          message: `NASA PSI AWS Open Data returned HTTP ${upstream.status}.`,
        });
        return;
      }

      const xml = await upstream.text();
      const commonPrefixes = extractXmlTags(xml, 'Prefix').filter(
        (p) => p !== rawPrefix && p.endsWith('/')
      );
      const objects: Array<{ key: string; sizeBytes: number; lastModified: string | null }> = [];
      const contentRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
      let match: RegExpExecArray | null;
      while ((match = contentRegex.exec(xml)) !== null) {
        const block = match[1];
        const key = extractXmlTags(block, 'Key')[0];
        const sizeStr = extractXmlTags(block, 'Size')[0];
        const lastMod = extractXmlTags(block, 'LastModified')[0] ?? null;
        if (key) {
          objects.push({
            key,
            sizeBytes: Number(sizeStr) || 0,
            lastModified: lastMod,
          });
        }
      }

      const dataPayload = {
        bucket: 'nasa-psi',
        registryUrl: 'https://registry.opendata.aws/nasa-psi/',
        s3BaseUrl: 'https://nasa-psi.s3.us-west-2.amazonaws.com/',
        prefix: rawPrefix,
        prefixes: commonPrefixes,
        objects: objects.slice(0, 50),
        combustionFilesFound: commonPrefixes
          .concat(objects.map((o) => o.key))
          .some((k) => /bass|saffire|flex|acme|spice|combustion|same|daft|sofie/i.test(k)),
      };

      if (psiOpenCache.size >= 30) {
        const oldest = psiOpenCache.keys().next().value;
        if (oldest) psiOpenCache.delete(oldest);
      }
      psiOpenCache.set(cacheKey, {
        expiresAt: Date.now() + NASA_CACHE_TTL_MS,
        data: dataPayload,
      });

      res.json({ cached: false, ...dataPayload });
    } catch {
      clearTimeout(timer);
      geminiProvider.recordExternalError(
        'NASA_PSI_OPEN',
        'PSI_OPEN_UNREACHABLE',
        'Failed or timed out reaching NASA PSI AWS Open Data S3 bucket.'
      );
      res.status(504).json({
        error: 'PSI_OPEN_UNREACHABLE',
        message: 'Unable to reach NASA PSI Open Data AWS S3 bucket.',
      });
    }
  });

  app.get('/api/ntrs/citation/:id', async (req, res) => {
    const id = req.params.id?.trim() ?? '';
    if (!/^\d{6,14}$/.test(id)) {
      res.status(400).json({
        error: 'INVALID_NTRS_ID',
        message: 'NTRS citation ID must be a 6 to 14 digit numeric identifier.',
      });
      return;
    }

    const cacheKey = `cit:${id}`;
    const cached = ntrsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json({ cached: true, citation: cached.data });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const upstream = await fetch(`https://ntrs.nasa.gov/api/citations/${id}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!upstream.ok) {
        res.status(upstream.status === 404 ? 404 : 502).json({
          error: 'NTRS_CITATION_ERROR',
          message: `NTRS returned HTTP ${upstream.status} for citation ${id}.`,
        });
        return;
      }
      const data = (await upstream.json()) as {
        id?: number;
        title?: string;
        abstract?: string;
        downloads?: Array<{
          draft?: boolean;
          name?: string;
          links?: { fulltext?: string; pdf?: string };
        }>;
      };
      const normalized = {
        id: data.id ?? Number(id),
        title: data.title ?? `NTRS ${id}`,
        abstract: data.abstract ?? null,
        downloads: (data.downloads ?? []).map((d) => ({
          name: d.name ?? `NTRS_${id}`,
          hasFullText: Boolean(d.links?.fulltext),
          hasPdf: Boolean(d.links?.pdf),
          fullTextUrl: d.links?.fulltext ? `https://ntrs.nasa.gov${d.links.fulltext}` : null,
          pdfUrl: d.links?.pdf ? `https://ntrs.nasa.gov${d.links.pdf}` : null,
        })),
      };
      ntrsCache.set(cacheKey, {
        expiresAt: Date.now() + NASA_CACHE_TTL_MS,
        data: normalized,
      });
      res.json({ cached: false, citation: normalized });
    } catch {
      clearTimeout(timer);
      geminiProvider.recordExternalError('NASA_NTRS', 'NTRS_CITATION_TIMEOUT', `Timeout fetching NTRS ${id}`);
      res.status(504).json({
        error: 'NTRS_UNREACHABLE',
        message: 'Timed out contacting NASA NTRS citation endpoint.',
      });
    }
  });

  app.get('/api/ntrs/download', async (req, res) => {
    const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
    if (!/^\d{6,14}$/.test(id)) {
      res.status(400).json({
        error: 'INVALID_NTRS_ID',
        message: 'Query parameter "id" must be a 6 to 14 digit NTRS ID.',
      });
      return;
    }

    const cacheKey = `txt:${id}`;
    const cached = ntrsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json({ cached: true, ...((cached.data as object) || {}) });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const targetUrl = `https://ntrs.nasa.gov/api/citations/${id}/downloads/${id}.txt`;
      const upstream = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timer);

      if (!upstream.ok) {
        res.status(upstream.status === 404 ? 404 : 502).json({
          error: 'NTRS_TEXT_UNAVAILABLE',
          message: `Public full-text .txt file is not available for NTRS ${id} (HTTP ${upstream.status}). Open https://ntrs.nasa.gov/citations/${id} directly.`,
        });
        return;
      }

      const rawText = await upstream.text();
      const maxBytes = 2 * 1024 * 1024;
      const truncated = rawText.length > maxBytes;
      const text = truncated ? rawText.slice(0, maxBytes) : rawText;

      const payload = {
        id: Number(id),
        sourceUrl: targetUrl,
        citationUrl: `https://ntrs.nasa.gov/citations/${id}`,
        byteLength: rawText.length,
        truncated,
        content: text,
      };
      ntrsCache.set(cacheKey, {
        expiresAt: Date.now() + NASA_CACHE_TTL_MS,
        data: payload,
      });
      res.json({ cached: false, ...payload });
    } catch {
      clearTimeout(timer);
      geminiProvider.recordExternalError('NASA_NTRS', 'NTRS_DOWNLOAD_FAILED', `Failed downloading NTRS ${id}.txt`);
      res.status(504).json({
        error: 'NTRS_DOWNLOAD_UNREACHABLE',
        message: 'Failed or timed out downloading NTRS full-text document.',
      });
    }
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
      answerMode?: unknown;
      documentContext?: unknown;
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

    if (!geminiProvider.isConfigured()) {
      res.status(503).json({
        error: 'GEMINI_API_KEY_MISSING',
        message:
          'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets (or .env) to enable live Gemini synthesis. Use Local Brief Mode or FLAREX investigation tools immediately.',
      });
      return;
    }

    const answerMode =
      body.answerMode === 'document' ? 'document' : 'grounded';

    let docTitle: string | undefined;
    let docSourceUrl: string | undefined;
    let docExcerpt: string | undefined;
    if (
      body.documentContext &&
      typeof body.documentContext === 'object' &&
      typeof (body.documentContext as { excerpt?: unknown }).excerpt === 'string'
    ) {
      const dc = body.documentContext as {
        title?: unknown;
        sourceUrl?: unknown;
        excerpt: string;
      };
      docTitle = typeof dc.title === 'string' ? dc.title.slice(0, 180) : 'Attached Scientific Document';
      docSourceUrl = typeof dc.sourceUrl === 'string' ? dc.sourceUrl.slice(0, 240) : undefined;
      docExcerpt = dc.excerpt.trim().slice(0, 5000);
    }

    const focusId =
      typeof body.focusInvestigationId === 'string' && body.focusInvestigationId
        ? body.focusInvestigationId
        : undefined;

    const rag = runAdvancedRagRetrieval(question, researchRecords, {
      maxResults: 4,
      focusInvestigationId: focusId,
      documentTitle: docTitle,
    });
    const relevantRecords = rag.selectedRecords;
    const queryClassification = rag.diagnostics.classification;

    const modeHintMap: Record<string, string> = {
      concept: 'Explain experimental concepts, methodology, hardware, and documented findings cleanly for students and researchers.',
      comparison: 'Perform a structured cross-study comparison highlighting differences in fuels, airflow, platform scale, and gravity compatibility warnings.',
      evidence: 'Audit evidence maturity (flight telemetry vs. descriptive overview vs. planned vs. terrestrial 1g) and state explicit limitations.',
      outline: 'Generate a concise structured literature-review outline and 3 grounded open research questions labeled as potential gaps in reviewed FLAREX sources.',
    };
    const modeKey = typeof body.analysisMode === 'string' ? body.analysisMode : 'concept';
    const modeInstruction = modeHintMap[modeKey] ?? modeHintMap.concept;

    const contextBlock = buildCompactContext(relevantRecords);
    const docSection =
      answerMode === 'document' && docExcerpt
        ? `\n\nATTACHED SOURCE DOCUMENT FOR DOCUMENT ANALYSIS MODE (${docTitle}${
            docSourceUrl ? ` | Origin: ${docSourceUrl}` : ''
          }):\n${docExcerpt}`
        : '';

    const promptInput = `ANSWER MODE: ${
      answerMode === 'document' ? 'DOCUMENT_ANALYSIS' : 'GROUNDED_RESEARCH'
    }\nQUERY CLASSIFICATION: ${queryClassification.label} (${queryClassification.strategyHint})\nANALYSIS MODE (${modeKey}): ${modeInstruction}\n\nUSER QUESTION:\n${question}\n\nRETRIEVED RELEVANT DOSSIER RECORDS (${relevantRecords.length} of ${researchRecords.length} total records):\n${contextBlock}${docSection}`;

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
            text: turn.text.slice(0, 1200),
          }))
      : [];

    const requestAbortController = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) {
        requestAbortController.abort();
      }
    });

    try {
      const result = await geminiProvider.generate({
        systemInstruction: FLAREX_SYSTEM_INSTRUCTION,
        history: sanitizedHistory,
        prompt: promptInput,
        timeoutMs: 30_000,
        signal: requestAbortController.signal,
      });

      const retrievedRefs = buildRetrievedSourceRefs(relevantRecords);
      const citationValidation = validateCitations(
        result.text,
        retrievedRefs,
        researchRecords
      );

      res.json({
        answer: result.text,
        model: result.model,
        providerName: result.providerName,
        latencyMs: result.latencyMs,
        attempts: result.attempts,
        answerMode,
        queryClassification,
        retrievedSources: retrievedRefs,
        ragDiagnostics: rag.diagnostics,
        citationValidation,
      });
    } catch (err: unknown) {
      if (requestAbortController.signal.aborted && res.writableEnded) {
        return;
      }
      const classified = classifyAiErrorStatus(err);
      if (err instanceof Error && err.message === 'EMPTY_AI_RESPONSE') {
        res.status(502).json({
          error: 'EMPTY_AI_RESPONSE',
          message:
            'The Gemini model returned an empty response. Please rephrase your question or switch to Local Brief Mode.',
        });
        return;
      }
      res.status(classified.httpStatus).json({
        error: classified.errorCode,
        message: classified.userMessage,
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
