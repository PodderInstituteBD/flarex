import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Compass,
  Sparkles,
} from 'lucide-react';
import { AppPage } from './Layout';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { DEMO_TOUR_STEPS, DemoTourStep } from '../utils/demoGuide';

interface DemoTourModalProps {
  open: boolean;
  onClose: () => void;
  onExecuteStepAction: (step: DemoTourStep) => void;
  onNavigate: (page: AppPage) => void;
}

export function DemoTourModal({
  open,
  onClose,
  onExecuteStepAction,
  onNavigate,
}: DemoTourModalProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = DEMO_TOUR_STEPS[stepIndex] ?? DEMO_TOUR_STEPS[0];

  const handleClose = () => {
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      titleId="demo-tour-title"
      maxWidthClass="max-w-2xl"
      title={
        <span className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-[var(--accent-cyan)]" aria-hidden="true" />
          <span>FLAREX Guided Demonstration Mode</span>
        </span>
      }
    >
      <div className="space-y-4">
        {/* Progress Pills (Interactive Step Jumpers) */}
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-1.5 flex-wrap">
            {DEMO_TOUR_STEPS.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStepIndex(idx)}
                aria-current={idx === stepIndex ? 'step' : undefined}
                aria-label={`Jump to demo step ${s.stepNumber}: ${s.title}`}
                className={`px-2 py-1 text-[11px] font-mono-tabular rounded-[6px] border transition-colors cursor-pointer ${
                  idx === stepIndex
                    ? 'bg-[var(--accent-blue)] text-[var(--accent-blue-contrast)] border-transparent font-semibold'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
                }`}
              >
                {s.stepNumber}
              </button>
            ))}
          </div>
          <Badge tone="cyan" className="font-mono-tabular">
            Step {currentStep.stepNumber} / {DEMO_TOUR_STEPS.length}
          </Badge>
        </div>

        {/* Step Content */}
        <div className="space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--accent-blue)]">
            {currentStep.subtitle}
          </p>
          <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
            {currentStep.title}
          </h3>
          <p className="text-xs sm:text-[13px] leading-relaxed text-[var(--text-secondary)]">
            {currentStep.explanation}
          </p>
        </div>

        {/* Highlights */}
        <ul className="space-y-2 p-3.5 rounded-[10px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]">
          {currentStep.highlights.map((item) => (
            <li key={item} className="flex items-start gap-2 leading-relaxed">
              <CheckCircle2
                className="w-3.5 h-3.5 text-[var(--status-success)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        {/* Live Action Trigger for Active Step */}
        <div className="p-3 rounded-[10px] bg-[var(--accent-blue)]/8 border border-[var(--accent-blue)]/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-[var(--text-secondary)]">
            <strong className="text-[var(--text-primary)] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent-cyan)]" aria-hidden="true" />
              <span>Interactive Evaluation Action (Real Data Only)</span>
            </strong>
            <span className="block mt-0.5">
              Opens the live module directly with verified records—never canned or simulated results.
            </span>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => {
              onExecuteStepAction(currentStep);
              handleClose();
            }}
          >
            <span>{currentStep.actionLabel}</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Button>
        </div>

        {/* Footer Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[var(--border-subtle)]">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onNavigate('overview');
              handleClose();
            }}
          >
            Skip Tour
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Previous</span>
            </Button>
            {stepIndex < DEMO_TOUR_STEPS.length - 1 ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setStepIndex((i) =>
                    Math.min(DEMO_TOUR_STEPS.length - 1, i + 1)
                  )
                }
              >
                <span>Next Step</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleClose}
              >
                Finish Tour
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
