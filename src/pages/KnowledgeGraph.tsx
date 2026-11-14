import { useMemo, useState } from 'react';
import {
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  Network,
  RotateCcw,
  Search,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { InvestigationRecord } from '../types/research';
import {
  buildKnowledgeGraph,
  KnowledgeNode,
  KnowledgeNodeType,
  layoutKnowledgeGraph,
  NODE_TYPE_META,
} from '../utils/knowledgeGraph';

interface KnowledgeGraphProps {
  investigations: InvestigationRecord[];
  initialFocusId?: string | 'ALL';
  onOpenInvestigation: (id: string) => void;
}

const ALL_NODE_TYPES = Object.keys(NODE_TYPE_META) as KnowledgeNodeType[];

export function KnowledgeGraph({
  investigations,
  initialFocusId = 'ALL',
  onOpenInvestigation,
}: KnowledgeGraphProps) {
  const [focusId, setFocusId] = useState<string | 'ALL'>(initialFocusId);
  const [includeInferred, setIncludeInferred] = useState(true);
  const [activeTypes, setActiveTypes] = useState<Set<KnowledgeNodeType>>(
    () => new Set(ALL_NODE_TYPES)
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const graph = useMemo(
    () =>
      buildKnowledgeGraph(investigations, {
        focusInvestigationId: focusId,
        includeInferred,
      }),
    [investigations, focusId, includeInferred]
  );

  const filteredNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return graph.nodes.filter((n) => {
      if (!activeTypes.has(n.type)) return false;
      if (!q) return true;
      return (
        n.label.toLowerCase().includes(q) ||
        (n.details?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [graph.nodes, activeTypes, searchQuery]);

  const visibleNodeIds = useMemo(
    () => new Set(filteredNodes.map((n) => n.id)),
    [filteredNodes]
  );

  const visibleEdges = useMemo(
    () =>
      graph.edges.filter(
        (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
      ),
    [graph.edges, visibleNodeIds]
  );

  const positionedNodes = useMemo(
    () => layoutKnowledgeGraph({ nodes: filteredNodes, edges: visibleEdges }, 920, 560),
    [filteredNodes, visibleEdges]
  );

  const nodePosMap = useMemo(
    () => new Map(positionedNodes.map((n) => [n.id, n])),
    [positionedNodes]
  );

  const selectedNode: KnowledgeNode | null = useMemo(() => {
    if (selectedNodeId) {
      const found = filteredNodes.find((n) => n.id === selectedNodeId);
      if (found) return found;
    }
    return positionedNodes[0] ?? null;
  }, [selectedNodeId, filteredNodes, positionedNodes]);

  const selectedNodeEdges = useMemo(() => {
    if (!selectedNode) return [];
    return visibleEdges.filter(
      (e) => e.source === selectedNode.id || e.target === selectedNode.id
    );
  }, [selectedNode, visibleEdges]);

  const toggleNodeType = (t: KnowledgeNodeType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) {
        if (next.size > 1) next.delete(t);
      } else {
        next.add(t);
      }
      return next;
    });
  };

  const resetViewport = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Scientific Intelligence"
        title="Microgravity Combustion Knowledge Graph"
        description="Interactive entity-relationship map connecting investigations, NASA publications, hardware platforms, fuels, environmental variables, sensors, methods, documented findings, topics, and limitations."
        meta={
          <span className="font-mono-tabular text-xs text-[var(--text-secondary)]">
            {positionedNodes.length} nodes · {visibleEdges.length} edges
          </span>
        }
      />

      {/* Controls Bar */}
      <Card padding="sm" className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4 space-y-1">
            <label
              htmlFor="kg-focus-select"
              className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
            >
              Graph Scope / Ego Study
            </label>
            <select
              id="kg-focus-select"
              value={focusId}
              onChange={(e) => {
                setFocusId(e.target.value);
                setSelectedNodeId(null);
                resetViewport();
              }}
              className="w-full px-3 py-2 text-xs rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
            >
              <option value="ALL">All {investigations.length} Indexed Investigations</option>
              {investigations.map((r) => (
                <option key={r.id} value={r.id}>
                  Focused Graph: {r.shortName} ({r.platform})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-4 space-y-1">
            <label
              htmlFor="kg-search-input"
              className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
            >
              Search Nodes
            </label>
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                id="kg-search-input"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter nodes (e.g. O2, PMMA, SAFFIRE, NTRS)..."
                className="w-full pl-8 pr-3 py-2 text-xs rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
            </div>
          </div>

          <div className="md:col-span-4 flex flex-wrap items-center gap-2 justify-start md:justify-end">
            <Button
              variant={includeInferred ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setIncludeInferred((v) => !v)}
              aria-pressed={includeInferred}
            >
              {includeInferred ? (
                <Eye className="w-3.5 h-3.5 text-[var(--status-warning)]" aria-hidden="true" />
              ) : (
                <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{includeInferred ? 'Inferred Links Visible' : 'Verified Links Only'}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.15).toFixed(2))))}
              aria-label="Zoom in graph"
            >
              <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoom((z) => Math.max(0.65, Number((z - 0.15).toFixed(2))))}
              aria-label="Zoom out graph"
            >
              <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={resetViewport}
              aria-label="Reset graph zoom and pan"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* Node Type Filters */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[var(--border-subtle)]">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] mr-1">
            <Filter className="w-3 h-3" aria-hidden="true" />
            Entity Types:
          </span>
          {ALL_NODE_TYPES.map((typeKey) => {
            const meta = NODE_TYPE_META[typeKey];
            const active = activeTypes.has(typeKey);
            return (
              <button
                key={typeKey}
                type="button"
                onClick={() => toggleNodeType(typeKey)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-[6px] border transition-colors cursor-pointer ${
                  active
                    ? 'bg-[var(--bg-elevated)] border-[var(--border-strong)] text-[var(--text-primary)]'
                    : 'bg-transparent border-[var(--border-subtle)] text-[var(--text-muted)] opacity-55'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: meta.color }}
                  aria-hidden="true"
                />
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Main Canvas + Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <Card padding="none" className="lg:col-span-8 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-5 h-0.5 bg-[var(--accent-blue)] inline-block" />
                Solid edge: Verified dossier relationship
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-5 h-0.5 border-t border-dashed border-[var(--status-warning)] inline-block" />
                Dashed edge: Inferred family link
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPan((p) => ({ ...p, x: p.x + 40 }))}
                className="px-1.5 py-0.5 rounded border border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] cursor-pointer"
                aria-label="Pan left"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => setPan((p) => ({ ...p, x: p.x - 40 }))}
                className="px-1.5 py-0.5 rounded border border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] cursor-pointer"
                aria-label="Pan right"
              >
                →
              </button>
              <button
                type="button"
                onClick={() => setPan((p) => ({ ...p, y: p.y + 30 }))}
                className="px-1.5 py-0.5 rounded border border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] cursor-pointer"
                aria-label="Pan up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => setPan((p) => ({ ...p, y: p.y - 30 }))}
                className="px-1.5 py-0.5 rounded border border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] cursor-pointer"
                aria-label="Pan down"
              >
                ↓
              </button>
              <span className="font-mono-tabular ml-1">{Math.round(zoom * 100)}%</span>
            </div>
          </div>

          <div className="bg-[var(--bg-primary)] lab-grid-bg overflow-hidden">
            <svg
              viewBox="0 0 920 560"
              className="w-full h-[420px] sm:h-[520px] block select-none"
              role="img"
              aria-label="Interactive FLAREX scientific knowledge graph"
            >
              <g
                transform={`translate(${460 + pan.x}, ${280 + pan.y}) scale(${zoom}) translate(-460, -280)`}
              >
                {visibleEdges.map((edge) => {
                  const s = nodePosMap.get(edge.source);
                  const t = nodePosMap.get(edge.target);
                  if (!s || !t) return null;
                  const isHighlighted =
                    selectedNode &&
                    (edge.source === selectedNode.id ||
                      edge.target === selectedNode.id);
                  return (
                    <line
                      key={edge.id}
                      x1={s.x}
                      y1={s.y}
                      x2={t.x}
                      y2={t.y}
                      stroke={
                        edge.verification === 'INFERRED'
                          ? 'var(--status-warning)'
                          : isHighlighted
                          ? 'var(--accent-blue)'
                          : 'var(--border-strong)'
                      }
                      strokeWidth={isHighlighted ? 2 : 1}
                      strokeDasharray={
                        edge.verification === 'INFERRED' ? '4 4' : undefined
                      }
                      opacity={
                        selectedNode
                          ? isHighlighted
                            ? 0.95
                            : 0.25
                          : 0.6
                      }
                    />
                  );
                })}

                {positionedNodes.map((node) => {
                  const meta = NODE_TYPE_META[node.type];
                  const isSelected = selectedNode?.id === node.id;
                  const isHovered = hoveredNodeId === node.id;
                  const isConnected =
                    selectedNode &&
                    selectedNodeEdges.some(
                      (e) => e.source === node.id || e.target === node.id
                    );
                  const r = node.type === 'INVESTIGATION' ? 11 : 7.5;
                  const denseMacroMode =
                    positionedNodes.length > 36 &&
                    !searchQuery.trim() &&
                    focusId === 'ALL' &&
                    zoom < 1.35;
                  const showLabel =
                    !denseMacroMode ||
                    node.type === 'INVESTIGATION' ||
                    isSelected ||
                    isHovered;

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x}, ${node.y})`}
                      onClick={() => setSelectedNodeId(node.id)}
                      onMouseEnter={() => setHoveredNodeId(node.id)}
                      onMouseLeave={() => setHoveredNodeId((prev) => (prev === node.id ? null : prev))}
                      className="cursor-pointer"
                      opacity={
                        selectedNode && !isSelected && !isConnected && !isHovered
                          ? 0.32
                          : 1
                      }
                    >
                      <title>{`${NODE_TYPE_META[node.type].label}: ${node.label}`}</title>
                      <circle
                        r={isSelected ? r + 3 : isHovered ? r + 1.5 : r}
                        fill={meta.color}
                        stroke={isSelected || isHovered ? '#FFFFFF' : 'var(--bg-primary)'}
                        strokeWidth={isSelected ? 2.5 : 1.5}
                      />
                      {showLabel && (
                        <text
                          y={r + 12}
                          textAnchor="middle"
                          className={`pointer-events-none ${
                            isSelected || isHovered
                              ? 'fill-[var(--text-primary)] text-[11px] font-semibold'
                              : 'fill-[var(--text-primary)] text-[10px] font-medium'
                          }`}
                        >
                          {node.label.length > 22
                            ? `${node.label.slice(0, 20)}…`
                            : node.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        </Card>

        {/* Inspector Sidebar */}
        <Card padding="md" className="lg:col-span-4 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-[var(--accent-blue)]" aria-hidden="true" />
              <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
                Node Provenance Inspector
              </h2>
            </div>
            {selectedNode && (
              <Badge tone="blue">{NODE_TYPE_META[selectedNode.type].label}</Badge>
            )}
          </div>

          {!selectedNode ? (
            <p className="text-xs text-[var(--text-secondary)]">
              Select any node on the graph canvas to inspect verified relationships, source provenance, and linked investigations.
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                  {selectedNode.label}
                </h3>
                {selectedNode.details && (
                  <p className="text-xs leading-relaxed text-[var(--text-secondary)] mt-1">
                    {selectedNode.details}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Connected Relationships ({selectedNodeEdges.length})
                </p>
                <ul className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {selectedNodeEdges.map((edge) => {
                    const otherId =
                      edge.source === selectedNode.id ? edge.target : edge.source;
                    const otherNode = nodePosMap.get(otherId);
                    if (!otherNode) return null;
                    return (
                      <li
                        key={edge.id}
                        className="p-2 rounded-[8px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setSelectedNodeId(otherNode.id)}
                            className="font-semibold text-[var(--text-primary)] hover:text-[var(--accent-blue)] text-left cursor-pointer"
                          >
                            {otherNode.label}
                          </button>
                          <p className="text-[11px] text-[var(--text-muted)]">
                            {edge.relationship.replace(/_/g, ' ')} · {edge.sourceEvidence}
                          </p>
                        </div>
                        <Badge
                          tone={
                            edge.verification === 'VERIFIED' ? 'success' : 'warning'
                          }
                        >
                          {edge.verification}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Linked Investigations ({selectedNode.investigationIds.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedNode.investigationIds.map((invId) => {
                    const rec = investigations.find((r) => r.id === invId);
                    if (!rec) return null;
                    return (
                      <Button
                        key={invId}
                        size="sm"
                        variant="secondary"
                        onClick={() => onOpenInvestigation(invId)}
                      >
                        {rec.shortName}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {selectedNode.sourceUrls.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-[var(--border-subtle)]">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Original Source Links
                  </p>
                  {selectedNode.sourceUrls.slice(0, 3).map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-[var(--accent-blue)] hover:underline truncate"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{url}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
