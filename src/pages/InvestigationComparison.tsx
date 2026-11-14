import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Info, X } from 'lucide-react';
import { EvidenceLabel } from '../components/EvidenceLabel';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Input';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState, NoticeBanner } from '../components/ui/States';
import { InvestigationRecord } from '../types/research';
import { buildComparisonRows } from '../utils/researchLogic';

interface InvestigationComparisonProps {
  investigations: InvestigationRecord[];
  selectedIds: string[];
  onUpdateSelection: (ids: string[]) => void;
  onOpenInvestigation: (id: string) => void;
}

export function InvestigationComparison({
  investigations,
  selectedIds,
  onUpdateSelection,
  onOpenInvestigation,
}: InvestigationComparisonProps) {
  const [differencesOnly, setDifferencesOnly] = useState(false);

  const selectedRecords = useMemo(
    () =>
      selectedIds
        .map((id) => investigations.find((r) => r.id === id))
        .filter((r): r is InvestigationRecord => Boolean(r)),
    [investigations, selectedIds]
  );

  const comparisonRows = useMemo(
    () => buildComparisonRows(selectedRecords),
    [selectedRecords]
  );

  const diffCount = useMemo(
    () => comparisonRows.filter((r) => r.hasDifference).length,
    [comparisonRows]
  );
  const alignedCount = comparisonRows.length - diffCount;
  const visibleRows = useMemo(
    () =>
      differencesOnly
        ? comparisonRows.filter((r) => r.hasDifference)
        : comparisonRows,
    [comparisonRows, differencesOnly]
  );

  const handleSlotChange = (slotIndex: number, newId: string) => {
    const next = [...selectedIds];
    if (!newId) {
      next.splice(slotIndex, 1);
    } else {
      next[slotIndex] = newId;
    }
    const deduped = Array.from(new Set(next.filter(Boolean))).slice(0, 3);
    onUpdateSelection(deduped);
  };

  const removeSlot = (id: string) => {
    onUpdateSelection(selectedIds.filter((item) => item !== id));
  };

  const loadPreset = (ids: string[]) => {
    onUpdateSelection(ids);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Cross-Study Matrix"
        title="Investigation Comparison"
        description="Compare 2 or 3 investigations side by side across objectives, platforms, fuels, sensors, evidence classifications, and limitations. Missing dossier fields are explicitly marked rather than converted to zero."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => loadPreset(['bass-ii', 'saffire', 'sofie-mist'])}
            >
              Solid &amp; Vehicle Fire
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => loadPreset(['same', 'daft', 'spice'])}
            >
              Soot &amp; Smoke
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                loadPreset(['bass-ii', 'acme-efield', 'battery-fire-ul'])
              }
            >
              Provenance Contrast
            </Button>
          </div>
        }
      />

      {/* Selector Slots (up to 3) */}
      <Card
        as="section"
        aria-label="Select two or three investigations to compare"
        padding="sm"
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        {[0, 1, 2].map((slotIdx) => {
          const currentId = selectedIds[slotIdx] ?? '';
          return (
            <div key={slotIdx} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor={`compare-slot-${slotIdx}`}
                  className="text-xs font-medium text-[var(--text-secondary)]"
                >
                  Study Slot {slotIdx + 1}{' '}
                  <span className="text-[var(--text-muted)]">
                    {slotIdx < 2 ? '(Required)' : '(Optional)'}
                  </span>
                </label>
                {currentId && (
                  <button
                    type="button"
                    onClick={() => removeSlot(currentId)}
                    aria-label={`Remove study from slot ${slotIdx + 1}`}
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--status-warning)] inline-flex items-center gap-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Clear</span>
                  </button>
                )}
              </div>
              <Select
                id={`compare-slot-${slotIdx}`}
                value={currentId}
                onChange={(e) => handleSlotChange(slotIdx, e.target.value)}
              >
                <option value="">
                  {slotIdx < 2
                    ? 'Select an investigation...'
                    : 'None (compare 2 studies)'}
                </option>
                {investigations.map((inv) => {
                  const takenElsewhere =
                    selectedIds.includes(inv.id) && inv.id !== currentId;
                  return (
                    <option
                      key={inv.id}
                      value={inv.id}
                      disabled={takenElsewhere}
                    >
                      {inv.shortName} ({inv.gravityContext})
                    </option>
                  );
                })}
              </Select>
            </div>
          );
        })}
      </Card>

      {selectedRecords.length < 2 ? (
        <EmptyState
          icon={<Info className="w-5 h-5" aria-hidden="true" />}
          title="Select at least two investigations to compare."
          description="Use the dropdown selectors above or choose one of the comparison presets to inspect differences, shared instrumentation, and gravity provenance."
          action={
            <Button
              type="button"
              variant="primary"
              onClick={() => loadPreset(['bass-ii', 'saffire', 'sofie-mist'])}
            >
              Load Solid &amp; Vehicle Fire Preset
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <NoticeBanner tone="info" title="Scientific Comparison Rule">
            Because the loaded dossier contains structured descriptions and heterogeneous operating ranges rather than standardized raw telemetry CSVs across studies, FLAREX performs structured qualitative and metadata comparison without synthesizing artificial parity scores.
          </NoticeBanner>

          {/* Summary & Filter Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge tone="blue" className="font-mono-tabular">
                {diffCount} differences
              </Badge>
              <Badge tone="success" className="font-mono-tabular">
                {alignedCount} aligned
              </Badge>
              <span className="text-[var(--text-muted)]">
                across {comparisonRows.length} scientific &amp; environmental dimensions
              </span>
            </div>

            <button
              type="button"
              onClick={() => setDifferencesOnly((d) => !d)}
              aria-pressed={differencesOnly}
              className={`px-3 py-1.5 text-xs font-medium rounded-[8px] border transition-colors cursor-pointer ${
                differencesOnly
                  ? 'bg-[var(--accent-blue)] text-[var(--accent-blue-contrast)] border-transparent font-semibold'
                  : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
              }`}
            >
              {differencesOnly ? 'Showing Differences Only' : 'Filter: Differences Only'}
            </button>
          </div>

          {/* Responsive Comparison Matrix */}
          <div className="overflow-x-auto rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-[var(--shadow-card)]">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)]">
                  <th
                    scope="col"
                    className="w-52 p-4 text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] align-top"
                  >
                    Dimension &amp; Match
                  </th>
                  {selectedRecords.map((rec) => (
                    <th
                      key={rec.id}
                      scope="col"
                      className="p-4 align-top border-l border-[var(--border-subtle)]"
                    >
                      <div className="space-y-2">
                        <EvidenceLabel type={rec.evidenceType} />
                        <p className="font-display text-[15px] font-semibold text-[var(--text-primary)]">
                          {rec.shortName}
                        </p>
                        <button
                          type="button"
                          onClick={() => onOpenInvestigation(rec.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-blue)] hover:underline cursor-pointer"
                        >
                          <span>Full Profile</span>
                          <ArrowRight className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {visibleRows.map((row) => (
                  <tr
                    key={row.fieldKey}
                    className={`transition-colors hover:bg-[var(--bg-elevated)]/45 ${
                      row.hasDifference ? 'bg-[var(--accent-blue)]/[0.02]' : ''
                    }`}
                  >
                    <th
                      scope="row"
                      className="p-4 text-xs font-semibold text-[var(--text-primary)] align-top"
                    >
                      <span className="block">{row.label}</span>
                      <span className="mt-1.5 inline-block">
                        {row.hasDifference ? (
                          <Badge tone="blue">Differs across studies</Badge>
                        ) : (
                          <Badge tone="success">
                            <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                            <span>Aligned</span>
                          </Badge>
                        )}
                      </span>
                    </th>
                    {row.values.map((cell) => (
                      <td
                        key={`${row.fieldKey}-${cell.investigationId}`}
                        className="p-4 text-xs sm:text-[13px] leading-relaxed align-top border-l border-[var(--border-subtle)]"
                      >
                        <p
                          className={
                            cell.isMissing
                              ? 'italic text-[var(--text-muted)]'
                              : 'text-[var(--text-secondary)]'
                          }
                        >
                          {cell.display}
                        </p>
                        {cell.cautionNote && (
                          <p className="mt-2 inline-flex items-start gap-1.5 text-xs text-[var(--status-warning)] font-medium">
                            <AlertTriangle
                              className="w-3.5 h-3.5 shrink-0 mt-0.5"
                              aria-hidden="true"
                            />
                            <span>{cell.cautionNote}</span>
                          </p>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
