import type { InvestigationRecord } from '../types/research.ts';
import { computeCategoryBreakdown } from './researchLogic.ts';

export type KnowledgeNodeType =
  | 'INVESTIGATION'
  | 'PUBLICATION'
  | 'PLATFORM'
  | 'FUEL'
  | 'VARIABLE'
  | 'SENSOR'
  | 'METHOD'
  | 'FINDING'
  | 'TOPIC'
  | 'LIMITATION';

export type EdgeVerificationStatus = 'VERIFIED' | 'INFERRED';

export interface KnowledgeNode {
  id: string;
  label: string;
  type: KnowledgeNodeType;
  investigationIds: string[];
  sourceUrls: string[];
  details?: string;
}

export interface KnowledgeEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
  verification: EdgeVerificationStatus;
  sourceEvidence: string;
}

export interface PositionedKnowledgeNode extends KnowledgeNode {
  x: number;
  y: number;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

export const NODE_TYPE_META: Record<
  KnowledgeNodeType,
  { label: string; color: string }
> = {
  INVESTIGATION: { label: 'Investigation', color: '#36AFFF' },
  PUBLICATION: { label: 'Publication / Source', color: '#35D6E8' },
  PLATFORM: { label: 'Platform / Hardware', color: '#8C7BFF' },
  FUEL: { label: 'Fuel / Material', color: '#F2B85B' },
  VARIABLE: { label: 'Environmental Variable', color: '#36C98F' },
  SENSOR: { label: 'Sensor / Diagnostic', color: '#38BDF8' },
  METHOD: { label: 'Measurement Method', color: '#A78BFA' },
  FINDING: { label: 'Documented Finding', color: '#34D399' },
  TOPIC: { label: 'Research Topic', color: '#60A5FA' },
  LIMITATION: { label: 'Research Limitation', color: '#F16B79' },
};

function slugifyId(prefix: string, raw: string): string {
  return `${prefix}:${raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)}`;
}

function shortTopicFromVariable(v: string): string {
  if (/oxygen|o2/i.test(v)) return 'Oxygen Concentration';
  if (/pressure|psi|atm/i.test(v)) return 'Ambient Pressure';
  if (/airflow|flow|coflow|opposed|concurrent|ventilation/i.test(v))
    return 'Airflow / Ventilation';
  if (/electric|voltage|kv|ion/i.test(v)) return 'Electric Field (Ion Wind)';
  if (/gravity|buoyancy/i.test(v)) return 'Gravity / Buoyancy Level';
  if (/radiat|wall|tunnel/i.test(v)) return 'Radiative Heat Transfer';
  if (/thickness|preheat/i.test(v)) return 'Fuel Thickness & Preheating';
  return v.split('(')[0].trim().slice(0, 40);
}

export function buildKnowledgeGraph(
  investigations: InvestigationRecord[],
  options?: {
    focusInvestigationId?: string | 'ALL';
    includeInferred?: boolean;
  }
): KnowledgeGraphData {
  const focusId = options?.focusInvestigationId ?? 'ALL';
  const includeInferred = options?.includeInferred ?? true;

  const targetRecords =
    focusId === 'ALL'
      ? investigations
      : investigations.filter((r) => r.id === focusId);

  const nodeMap = new Map<string, KnowledgeNode>();
  const edges: KnowledgeEdge[] = [];
  const edgeKeys = new Set<string>();

  const ensureNode = (
    id: string,
    label: string,
    type: KnowledgeNodeType,
    invId: string,
    url: string,
    details?: string
  ) => {
    const existing = nodeMap.get(id);
    if (existing) {
      if (!existing.investigationIds.includes(invId)) {
        existing.investigationIds.push(invId);
      }
      if (!existing.sourceUrls.includes(url)) {
        existing.sourceUrls.push(url);
      }
      return;
    }
    nodeMap.set(id, {
      id,
      label,
      type,
      investigationIds: [invId],
      sourceUrls: [url],
      details,
    });
  };

  const addEdge = (
    source: string,
    target: string,
    relationship: string,
    verification: EdgeVerificationStatus,
    sourceEvidence: string
  ) => {
    const key = `${source}|${relationship}|${target}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({
      id: `edge-${edges.length + 1}`,
      source,
      target,
      relationship,
      verification,
      sourceEvidence,
    });
  };

  const catBreakdown = computeCategoryBreakdown(investigations);

  for (const rec of targetRecords) {
    const invNodeId = `inv:${rec.id}`;
    ensureNode(
      invNodeId,
      rec.shortName,
      'INVESTIGATION',
      rec.id,
      rec.sourceUrl,
      `${rec.name} (${rec.timeframe}) · ${rec.gravityContext}`
    );

    // Platform
    const platNodeId = slugifyId('plat', rec.platform);
    ensureNode(
      platNodeId,
      rec.platform,
      'PLATFORM',
      rec.id,
      rec.sourceUrl,
      rec.hardware ?? rec.platform
    );
    addEdge(invNodeId, platNodeId, 'CONDUCTED_ON', 'VERIFIED', rec.sourceLabel);

    // Topics
    for (const cat of catBreakdown) {
      if (cat.recordIds.includes(rec.id)) {
        const topicId = `topic:${cat.id}`;
        ensureNode(topicId, cat.label, 'TOPIC', rec.id, rec.sourceUrl, cat.description);
        addEdge(invNodeId, topicId, 'STUDIES_TOPIC', 'VERIFIED', rec.sourceLabel);
      }
    }

    // Publications / Primary Source
    const primaryPubId = slugifyId('pub', `${rec.id}-primary`);
    ensureNode(
      primaryPubId,
      rec.ntrsDocumentId
        ? `NTRS ${rec.ntrsDocumentId}`
        : rec.doi
        ? `DOI ${rec.doi}`
        : rec.sourceLabel.slice(0, 42),
      'PUBLICATION',
      rec.id,
      rec.sourceUrl,
      rec.sourceLabel
    );
    addEdge(primaryPubId, invNodeId, 'DOCUMENTS', 'VERIFIED', rec.sourceUrl);

    if (rec.publications) {
      for (const pub of rec.publications) {
        const pubId = slugifyId('pub', pub.doi);
        ensureNode(
          pubId,
          `${pub.title.slice(0, 38)}…`,
          'PUBLICATION',
          rec.id,
          `https://doi.org/${pub.doi}`,
          `${pub.title} (${pub.journal}, ${pub.date})`
        );
        addEdge(pubId, invNodeId, 'DESCRIBES', 'VERIFIED', `DOI ${pub.doi}`);
      }
    }

    // Fuels & Materials (bounded in All-mode to keep graph readable, full in focused mode)
    const fuelsList = focusId === 'ALL' ? rec.fuels.slice(0, 2) : rec.fuels;
    for (const fuel of fuelsList) {
      const cleanFuel = fuel.split('(')[0].trim();
      const fuelId = slugifyId('fuel', cleanFuel);
      ensureNode(fuelId, cleanFuel, 'FUEL', rec.id, rec.sourceUrl, fuel);
      addEdge(invNodeId, fuelId, 'USES_FUEL', 'VERIFIED', rec.sourceLabel);
    }

    // Environmental Variables
    const envList =
      focusId === 'ALL'
        ? rec.environmentalVariables.slice(0, 2)
        : rec.environmentalVariables;
    for (const envVar of envList) {
      const normalized = shortTopicFromVariable(envVar);
      const varId = slugifyId('var', normalized);
      ensureNode(varId, normalized, 'VARIABLE', rec.id, rec.sourceUrl, envVar);
      addEdge(invNodeId, varId, 'VARIES_OR_MEASURES', 'VERIFIED', rec.sourceLabel);
    }

    // Sensors
    const sensorList = focusId === 'ALL' ? rec.sensors.slice(0, 2) : rec.sensors;
    for (const sensor of sensorList) {
      const cleanSensor = sensor.split('(')[0].trim().slice(0, 38);
      const sensorId = slugifyId('sensor', cleanSensor);
      ensureNode(sensorId, cleanSensor, 'SENSOR', rec.id, rec.sourceUrl, sensor);
      addEdge(invNodeId, sensorId, 'USES_SENSOR', 'VERIFIED', rec.sourceLabel);
    }

    // Measurement Methods (focused view or concise node)
    if (rec.measurementMethods && (focusId !== 'ALL' || rec.sensors.length === 0)) {
      const methodLabel = rec.measurementMethods.split(/[,;]/)[0].trim().slice(0, 42);
      const methodId = slugifyId('method', methodLabel);
      ensureNode(
        methodId,
        methodLabel,
        'METHOD',
        rec.id,
        rec.sourceUrl,
        rec.measurementMethods
      );
      addEdge(invNodeId, methodId, 'USES_METHOD', 'VERIFIED', rec.sourceLabel);
    }

    // Findings (show in focused view cleanly; in All-mode show summary findings for primary records)
    if (rec.reportedFindings && focusId !== 'ALL') {
      const findId = `finding:${rec.id}`;
      ensureNode(
        findId,
        `${rec.shortName} Finding`,
        'FINDING',
        rec.id,
        rec.sourceUrl,
        rec.reportedFindings
      );
      addEdge(invNodeId, findId, 'REPORTS_FINDING', 'VERIFIED', rec.sourceLabel);
      addEdge(findId, primaryPubId, 'SUPPORTED_BY', 'VERIFIED', rec.sourceLabel);
    }

    // Limitations (focused view)
    if (focusId !== 'ALL') {
      rec.limitations.forEach((lim, idx) => {
        const limId = `lim:${rec.id}:${idx}`;
        ensureNode(
          limId,
          lim.slice(0, 38) + (lim.length > 38 ? '…' : ''),
          'LIMITATION',
          rec.id,
          rec.sourceUrl,
          lim
        );
        addEdge(invNodeId, limId, 'HAS_LIMITATION', 'VERIFIED', rec.sourceLabel);
      });
    }
  }

  // Explicitly marked INFERRED relationships: shared domain or fuel analogs across records
  if (includeInferred && focusId === 'ALL') {
    const invNodes = Array.from(nodeMap.values()).filter(
      (n) => n.type === 'INVESTIGATION'
    );
    for (let i = 0; i < invNodes.length; i += 1) {
      for (let j = i + 1; j < invNodes.length; j += 1) {
        const a = targetRecords.find((r) => `inv:${r.id}` === invNodes[i].id);
        const b = targetRecords.find((r) => `inv:${r.id}` === invNodes[j].id);
        if (!a || !b) continue;
        if (
          a.family === b.family &&
          a.isMicrogravity === b.isMicrogravity
        ) {
          addEdge(
            invNodes[i].id,
            invNodes[j].id,
            'RELATED_PROGRAM_FAMILY',
            'INFERRED',
            `Shared dossier family: ${a.family}`
          );
        }
      }
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
  };
}

export function layoutKnowledgeGraph(
  graph: KnowledgeGraphData,
  width = 920,
  height = 560
): PositionedKnowledgeNode[] {
  const cx = width / 2;
  const cy = height / 2;

  const invNodes = graph.nodes.filter((n) => n.type === 'INVESTIGATION');
  const otherNodes = graph.nodes.filter((n) => n.type !== 'INVESTIGATION');

  const positioned = new Map<string, PositionedKnowledgeNode>();

  if (invNodes.length === 1) {
    positioned.set(invNodes[0].id, { ...invNodes[0], x: cx, y: cy });
    const count = Math.max(1, otherNodes.length);
    otherNodes.forEach((node, idx) => {
      const angle = (2 * Math.PI * idx) / count - Math.PI / 2;
      const ringRadius = idx % 2 === 0 ? 185 : 245;
      positioned.set(node.id, {
        ...node,
        x: Math.round(cx + Math.cos(angle) * ringRadius),
        y: Math.round(cy + Math.sin(angle) * (ringRadius * 0.85)),
      });
    });
  } else {
    // Inner ring for investigations, outer ring for connected entities grouped by angle
    const invCount = Math.max(1, invNodes.length);
    invNodes.forEach((node, idx) => {
      const angle = (2 * Math.PI * idx) / invCount - Math.PI / 2;
      positioned.set(node.id, {
        ...node,
        x: Math.round(cx + Math.cos(angle) * 145),
        y: Math.round(cy + Math.sin(angle) * 125),
      });
    });

    const otherCount = Math.max(1, otherNodes.length);
    otherNodes.forEach((node, idx) => {
      const angle = (2 * Math.PI * idx) / otherCount - Math.PI / 2;
      const rX = 325 + (idx % 3) * 32;
      const rY = 215 + (idx % 3) * 20;
      positioned.set(node.id, {
        ...node,
        x: Math.round(cx + Math.cos(angle) * rX),
        y: Math.round(cy + Math.sin(angle) * rY),
      });
    });
  }

  return graph.nodes.map((n) => positioned.get(n.id)!);
}
