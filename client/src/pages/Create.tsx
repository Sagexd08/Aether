import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dices, Download, History, RotateCcw, X } from 'lucide-react';
import { MosaicField, type MosaicHandle } from '@/components/MosaicField';
import { GenerationProgress } from '@/components/GenerationProgress';
import { RecentGenerations } from '@/components/RecentGenerations';
import { useJobPolling } from '@/hooks/useJobPolling';
import { useBackgroundPause } from '@/hooks/useBackgroundPause';
import { useToast } from '@/components/ui/Toast';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const MAX_SEED = 2 ** 31 - 1;
const MAX_TEXTAREA_PX = 112;
const ASSEMBLE_TIMEOUT_MS = 1500;
const MAX_PROMPT = 1000;

const STARTERS = ['a dog', 'a child', 'a bird', 'a boat', 'a horse'];
const ACTIONS = ['running', 'jumping', 'sitting', 'standing', 'swimming'];
const SETTINGS = ['on a beach', 'in the snow', 'on the grass', 'in the water', 'in the mountains', 'in a city street'];

type Phase = 'idle' | 'generating' | 'assembling' | 'done';

interface Params {
  prompt: string;
  steps: number;
  cfg: number;
  seed?: number;
}

interface Result {
  url: string;
  requestId: string;
}

interface ChipGroupProps {
  label: string;
  options: string[];
  value: string | null;
  onChange: (next: string | null) => void;
  disabled: boolean;
}

function ChipGroup({ label, options, value, onChange, disabled }: ChipGroupProps) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="w-16 font-mono text-xs text-muted-foreground">{label}</span>
      {options.map((option) => {
        const active = value === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(active ? null : option)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function StepHeader({ index, title, done }: { index: number; title: string; done: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs ${
          done ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground'
        }`}
      >
        {index}
      </span>
      <h2 className="text-sm font-medium">{title}</h2>
    </div>
  );
}

export default function Create() {
  const toast = useToast();
  const mosaicRef = useRef<MosaicHandle>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [paused, togglePaused] = useBackgroundPause();
  const [phase, setPhase] = useState<Phase>('idle');
  const [description, setDescription] = useState('');
  const [action, setAction] = useState<string | null>(null);
  const [setting, setSetting] = useState<string | null>(null);
  const [steps, setSteps] = useState(20);
  const [cfg, setCfg] = useState(3);
  const [seed, setSeed] = useState<number | undefined>();
  const [result, setResult] = useState<Result | null>(null);
  const [smooth, setSmooth] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [lastParams, setLastParams] = useState<Params | null>(null);

  const composed = useMemo(
    () => [description.trim(), action, setting].filter(Boolean).join(' ').slice(0, MAX_PROMPT),
    [description, action, setting],
  );

  const handleComplete = useCallback((job: { result?: { image_url: string; request_id: string } }) => {
    if (!job.result) {
      setPhase('idle');
      return;
    }
    setResult({ url: job.result.image_url, requestId: job.result.request_id });
    setRefreshTrigger((n) => n + 1);
    setPhase('assembling');
  }, []);

  const handleError = useCallback(
    (message: string) => {
      setPhase('idle');
      toast.toast({ message, type: 'error' });
    },
    [toast],
  );

  const { activeJob, startPolling, cancelJob } = useJobPolling({
    onComplete: handleComplete,
    onError: handleError,
  });

  useEffect(() => {
    if (phase !== 'assembling') return undefined;
    const box = slotRef.current?.getBoundingClientRect();
    const finish = () => setPhase('done');
    if (!box || !mosaicRef.current) {
      finish();
      return undefined;
    }
    const timer = window.setTimeout(finish, ASSEMBLE_TIMEOUT_MS);
    mosaicRef.current
      .assemble({ x: box.left, y: box.top, size: box.width })
      .catch(() => undefined)
      .then(finish);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [description]);

  const generate = async () => {
    if (!composed || phase === 'generating' || phase === 'assembling') return;
    setLastParams({ prompt: composed, steps, cfg, seed });
    setResult(null);
    setSmooth(false);
    setPhase('generating');
    try {
      const response = await fetch(`${API_BASE}/api/jobs/generate`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positive_prompt: composed, steps, cfg_scale: cfg, seed }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const retry = response.headers.get('Retry-After');
        const suffix = response.status === 429 && retry ? ` Try again in ${retry}s.` : '';
        throw new Error(`${body.error || 'Failed to start generation'}${suffix}`);
      }
      const { job_id } = await response.json();
      startPolling(job_id);
    } catch (error) {
      setPhase('idle');
      toast.toast({ message: error instanceof Error ? error.message : 'Failed to start generation', type: 'error' });
    }
  };

  const startOver = () => {
    mosaicRef.current?.disperse();
    setResult(null);
    setPhase('idle');
    textareaRef.current?.focus();
  };

  const reuse = () => {
    if (!lastParams) return;
    setDescription(lastParams.prompt);
    setAction(null);
    setSetting(null);
    setSteps(lastParams.steps);
    setCfg(lastParams.cfg);
    setSeed(lastParams.seed);
    startOver();
  };

  const busy = phase === 'generating' || phase === 'assembling';
  const showResult = phase === 'assembling' || phase === 'done';

  return (
    <div className="mx-auto flex min-h-[calc(100vh-10rem)] w-full max-w-[720px] flex-col items-center justify-center gap-8 text-center">
      <MosaicField ref={mosaicRef} paused={paused} />

      <button
        type="button"
        onClick={() => setHistoryOpen(true)}
        className="surface inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <History className="h-3.5 w-3.5" aria-hidden="true" />
        History
      </button>

      {showResult ? (
        <div className="flex flex-col items-center gap-4">
          <div ref={slotRef} className="relative h-64 w-64">
            {phase === 'done' && result && (
              <img
                src={result.url}
                alt={lastParams?.prompt ?? 'Generated image'}
                width={256}
                height={256}
                className={`h-64 w-64 animate-fade-in ${smooth ? '' : 'pixelated'}`}
              />
            )}
          </div>
          {phase === 'done' && result && (
            <>
              <p className="max-w-md font-mono text-xs text-muted-foreground">{lastParams?.prompt}</p>
              <div className="flex flex-wrap items-center justify-center gap-2 font-mono text-xs">
                <button
                  type="button"
                  aria-pressed={smooth}
                  onClick={() => setSmooth((v) => !v)}
                  className="surface rounded-full px-3 py-1.5 text-muted-foreground hover:text-foreground"
                >
                  {smooth ? 'enlarged, no added detail' : 'pixel-accurate'}
                </button>
                <a
                  href={result.url}
                  download={`aether-${result.requestId}.png`}
                  className="surface inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  download
                </a>
                <button
                  type="button"
                  onClick={reuse}
                  className="surface inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  reuse settings
                </button>
                <button type="button" onClick={startOver} className="rounded-full bg-primary px-3 py-1.5 text-primary-foreground">
                  new
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <h1 className="text-4xl font-light tracking-tight md:text-[40px]">what should the model draw?</h1>
      )}

      {!showResult && (
        <div className="relative w-full">
          <div className="halo pointer-events-none absolute inset-x-6 -inset-y-2 -z-10 rounded-full" aria-hidden="true" />
          <form
            className="surface space-y-6 rounded-lg p-5 text-left"
            onSubmit={(e) => {
              e.preventDefault();
              generate();
            }}
          >
            <section className="space-y-3" aria-label="Describe">
              <StepHeader index={1} title="Describe" done={description.trim().length > 0} />
              <label htmlFor="prompt" className="sr-only">
                Prompt
              </label>
              <textarea
                id="prompt"
                ref={textareaRef}
                value={description}
                maxLength={MAX_PROMPT}
                rows={1}
                disabled={busy}
                placeholder="a red bird on a branch"
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    generate();
                  }
                }}
                className="max-h-28 min-h-[2.5rem] w-full resize-none rounded-md border border-border bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground"
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-16 font-mono text-xs text-muted-foreground">start with</span>
                {STARTERS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    disabled={busy}
                    onClick={() => setDescription(starter)}
                    className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-3" aria-label="Refine">
              <StepHeader index={2} title="Refine (optional)" done={Boolean(action || setting)} />
              <ChipGroup label="action" options={ACTIONS} value={action} onChange={setAction} disabled={busy} />
              <ChipGroup label="setting" options={SETTINGS} value={setting} onChange={setSetting} disabled={busy} />
            </section>

            <section className="space-y-3" aria-label="Generate">
              <StepHeader index={3} title="Generate" done={busy} />
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs text-muted-foreground">
                <label className="flex items-center gap-2">
                  steps
                  <input
                    type="range"
                    min={1}
                    max={50}
                    value={steps}
                    onChange={(e) => setSteps(Number(e.target.value))}
                    className="w-24 accent-[hsl(var(--primary))]"
                  />
                  <span className="w-6 text-foreground">{steps}</span>
                </label>
                <label className="flex items-center gap-2">
                  guidance
                  <input
                    type="range"
                    min={1}
                    max={6}
                    step={0.5}
                    value={cfg}
                    onChange={(e) => setCfg(Number(e.target.value))}
                    className="w-24 accent-[hsl(var(--primary))]"
                  />
                  <span className="w-6 text-foreground">{cfg}</span>
                </label>
                <label className="flex items-center gap-2">
                  seed
                  <input
                    type="number"
                    min={0}
                    max={MAX_SEED}
                    value={seed ?? ''}
                    placeholder="random"
                    onChange={(e) => setSeed(e.target.value === '' ? undefined : Number(e.target.value))}
                    className="w-28 rounded-sm border border-border bg-transparent px-2 py-1 text-foreground outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Random seed"
                    onClick={() => setSeed(Math.floor(Math.random() * MAX_SEED))}
                    className="rounded-sm p-1 hover:text-foreground"
                  >
                    <Dices className="h-4 w-4" aria-hidden="true" />
                  </button>
                </label>
              </div>
              <p className="min-h-[1.25rem] font-mono text-xs text-muted-foreground" aria-live="polite">
                {composed ? `prompt: ${composed}` : 'prompt: (empty)'}
              </p>
              <button
                type="submit"
                disabled={busy || !composed}
                className="w-full rounded-md bg-primary px-4 py-3 text-primary-foreground transition-opacity disabled:opacity-40"
              >
                {busy ? 'Generating…' : 'Generate'}
              </button>
            </section>
          </form>
        </div>
      )}

      {phase === 'generating' && activeJob && (
        <div className="w-full" aria-live="polite">
          <GenerationProgress
            status={activeJob.status}
            progress={activeJob.progress}
            message={activeJob.progress_message}
            onCancel={() => activeJob.job_id && cancelJob(activeJob.job_id).then(() => setPhase('idle'))}
          />
        </div>
      )}

      <p className="font-mono text-xs text-muted-foreground">
        Aether T2I · 16.3M parameters · 64x64 · trained from scratch
      </p>

      <button
        type="button"
        onClick={togglePaused}
        aria-pressed={paused}
        className="font-mono text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        {paused ? 'play background' : 'pause background'}
      </button>

      {historyOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-center bg-background/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="History"
        >
          <div className="surface flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-lg bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-mono text-sm">History</h2>
              <button
                type="button"
                aria-label="Close history"
                onClick={() => setHistoryOpen(false)}
                className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              <RecentGenerations
                refreshTrigger={refreshTrigger}
                onRegenerate={(gen) => {
                  setDescription(gen.positive_prompt);
                  setAction(null);
                  setSetting(null);
                  setSteps(gen.steps);
                  setCfg(gen.cfg_scale);
                  setSeed(gen.seed);
                  setHistoryOpen(false);
                  startOver();
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
