import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  FlaskConical,
  Globe,
} from 'lucide-react';
import { DataAvailabilityStatus, EvidenceType } from '../types/research';
import { Badge, BadgeTone } from './ui/Badge';

interface EvidenceLabelProps {
  type: EvidenceType;
}

export function EvidenceLabel({ type }: EvidenceLabelProps) {
  const config: Record<
    EvidenceType,
    { tone: BadgeTone; Icon: typeof FileText }
  > = {
    'RAW DATA': { tone: 'success', Icon: CheckCircle2 },
    'PEER-REVIEWED PAPER': { tone: 'cyan', Icon: FileText },
    'NASA INVESTIGATION DESCRIPTION': { tone: 'blue', Icon: FlaskConical },
    'PRESENTATION / ABSTRACT': { tone: 'warning', Icon: Clock },
    'REVIEW PAPER': { tone: 'violet', Icon: FileText },
    'COMPLEMENTARY TERRESTRIAL RESEARCH': { tone: 'warning', Icon: Globe },
  };

  const { tone, Icon } = config[type];

  return (
    <Badge tone={tone}>
      <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span>{type}</span>
    </Badge>
  );
}

interface AvailabilityIndicatorProps {
  status: DataAvailabilityStatus;
  label: string;
}

export function AvailabilityIndicator({
  status,
  label,
}: AvailabilityIndicatorProps) {
  const isAvailable = status === 'PUBLIC_IN_PSI';
  const isWarning =
    status === 'PLANNED_NO_PUBLIC_DATA' || status === 'TERRESTRIAL_LAB_ONLY';

  const tone = isAvailable
    ? 'text-[var(--status-success)]'
    : isWarning
    ? 'text-[var(--status-warning)]'
    : 'text-[var(--text-secondary)]';

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${tone}`}>
      {isAvailable ? (
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      ) : isWarning ? (
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
}
