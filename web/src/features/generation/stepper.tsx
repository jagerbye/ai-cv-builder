import './stepper.css';

export type StepStage = 'extracting' | 'composing' | 'verifying';
type StepKey = 'queued' | StepStage;
type StepState = 'done' | 'current' | 'failed' | 'ahead';

// The KNOWN sequence. Position in it is a fact the server reports. There is
// deliberately no percentage and no progressbar role: the server does not know how
// long a stage takes, so any percentage would be invented (spec §3.3), in a product
// whose point is not inventing what it does not know. A list with the current step
// marked says only what is true.
const STEPS: Array<{ key: StepKey; label: string }> = [
  { key: 'queued', label: 'Queued' },
  { key: 'extracting', label: 'Extracting' },
  { key: 'composing', label: 'Composing' },
  { key: 'verifying', label: 'Verifying' },
];

const STATE_WORD: Record<StepState, string> = {
  done: 'done',
  current: 'in progress',
  failed: 'failed',
  ahead: '',
};

function stateOf(index: number, at: number, failed: boolean): StepState {
  if (index < at) return 'done';
  if (index > at) return 'ahead';
  return failed ? 'failed' : 'current';
}

// `at` is the index of the step the job is on. Running with no stage yet sits
// between Queued and Extracting: Queued is done, nothing is current.
export function GenerationSteps({
  status,
  stage,
}: {
  status: 'queued' | 'running' | 'failed';
  stage: StepStage | null;
}) {
  const failed = status === 'failed';
  const stageIndex = stage ? STEPS.findIndex((s) => s.key === stage) : -1;
  const at = stageIndex >= 0 ? stageIndex : status === 'running' ? 0.5 : 0;
  return (
    <ol className="steps" aria-label="Generation steps">
      {STEPS.map((step, i) => {
        const state = stateOf(i, at, failed);
        const word =
          step.key === 'queued' && state === 'current' ? 'Waiting to start' : STATE_WORD[state];
        return (
          <li
            key={step.key}
            className="step"
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span data-step-label>{step.label}</span>
            {word ? <span className="step-state">{word}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
