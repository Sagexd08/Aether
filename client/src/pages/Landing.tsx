import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { MosaicField } from '@/components/MosaicField';
import { useBackgroundPause } from '@/hooks/useBackgroundPause';

const SAMPLES = Object.values(
  import.meta.glob('../assets/tiles/*.png', { eager: true, query: '?url', import: 'default' }),
).slice(0, 8) as string[];

const STEPS = [
  { name: 'Describe', body: 'Write one plain sentence about what you want to see. The model reads English only.' },
  { name: 'Refine', body: 'Pick a subject, a setting and a colour from the chips. They are added to your sentence so you can see the exact prompt.' },
  { name: 'Generate', body: 'Choose steps, guidance and a seed. The same seed and settings give the same picture back.' },
];

const COMPARISON = [
  { row: 'Cost', aether: 'Free, with daily limits', other: 'Usually credits or a subscription' },
  { row: 'Weights', aether: 'Trained from random weights here', other: 'Third-party or fine-tuned checkpoints' },
  { row: 'Resolution', aether: '64x64 pixels', other: '1024 pixels and above' },
  { row: 'Prompt following', aether: 'Simple scenes only', other: 'Detailed, compositional prompts' },
  { row: 'Your data', aether: 'Deletable from the app, purged by age', other: 'Varies by provider' },
];

const LIMITS = [
  'Output is 64x64. Enlarging it adds no detail.',
  'Faces are soft and often unrecognisable.',
  'It was trained on 8,000 photos with English captions, so the vocabulary is small.',
  'Complex scenes, counting and text in images do not work.',
];

const FAQ = [
  { q: 'Is it really trained from scratch?', a: 'Yes. Every weight started random and was trained on a single consumer GPU. No pretrained checkpoint and no third-party generation API is used.' },
  { q: 'Why is the picture so small?', a: 'A 16.3M-parameter model trained on a small dataset can only draw a coherent image at 64x64. A larger model needs more data and compute than this project has.' },
  { q: 'What should I write?', a: 'Short, concrete sentences such as "a brown dog running on grass" or "a boat on the water". Guidance between 2 and 4 usually works best.' },
  { q: 'Do I need an account?', a: 'No. Anonymous visitors get a daily allowance per session and per network. Signing in raises it.' },
  { q: 'What happens to my prompts and images?', a: 'They are tied to your session, can be deleted from the app, and are removed automatically after a retention period.' },
  { q: 'Can I use the images?', a: 'The model was trained on a research-only dataset, so treat outputs as experimental and do not rely on them commercially.' },
];

export default function Landing() {
  const [paused, togglePaused] = useBackgroundPause();

  return (
    <div className="space-y-28 pb-16">
      <MosaicField paused={paused} />

      <section className="mx-auto flex max-w-3xl flex-col items-center gap-8 pt-10 text-center md:pt-20">
        <p className="surface rounded-full px-4 py-1.5 font-mono text-xs text-muted-foreground">
          free · trained from scratch · 64x64
        </p>
        <h1 className="text-5xl font-light leading-[1.05] tracking-tight md:text-7xl">
          From a sentence
          <br />
          to a picture.
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Aether is a 16.3M-parameter text-to-image model trained from random weights. It is small, and it is honest
          about what it can do.
        </p>
        <ol className="flex flex-wrap items-center justify-center gap-2 font-mono text-xs">
          {STEPS.map((step, index) => (
            <li key={step.name} className="surface flex items-center gap-2 rounded-full px-3 py-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                {index + 1}
              </span>
              {step.name}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/create"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-primary-foreground"
          >
            Start creating
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <a href="#how" className="rounded-full px-6 py-3 text-muted-foreground hover:text-foreground">
            How it works
          </a>
        </div>
        <button
          type="button"
          onClick={togglePaused}
          aria-pressed={paused}
          className="font-mono text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          {paused ? 'play background' : 'pause background'}
        </button>
      </section>

      <section aria-labelledby="samples" className="mx-auto max-w-5xl space-y-6">
        <h2 id="samples" className="text-2xl font-light tracking-tight">
          Real output, unedited
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SAMPLES.map((src, index) => (
            <li key={src} className={index % 3 === 0 ? 'sm:translate-y-4' : ''}>
              <img
                src={src}
                alt={`Sample generation ${index + 1}`}
                width={64}
                height={64}
                loading="lazy"
                className="pixelated aspect-square w-full rounded-md border border-border"
              />
            </li>
          ))}
        </ul>
        <p className="font-mono text-xs text-muted-foreground">64x64 samples from this model, enlarged without smoothing.</p>
      </section>

      <section id="how" aria-labelledby="how-title" className="mx-auto max-w-5xl space-y-8">
        <h2 id="how-title" className="text-2xl font-light tracking-tight">
          Three steps, one sentence
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.name} className={`surface space-y-3 rounded-lg p-6 ${index === 1 ? 'md:-translate-y-3' : ''}`}>
              <p className="font-mono text-xs text-muted-foreground">0{index + 1}</p>
              <h3 className="text-xl font-light">{step.name}</h3>
              <p className="text-sm text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="compare" className="mx-auto max-w-4xl space-y-6">
        <h2 id="compare" className="text-2xl font-light tracking-tight">
          What you get, and what you do not
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border font-mono text-xs text-muted-foreground">
                <th scope="col" className="py-3 pr-4 font-normal" />
                <th scope="col" className="py-3 pr-4 font-normal">
                  Aether
                </th>
                <th scope="col" className="py-3 font-normal">
                  Typical hosted generator
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((item) => (
                <tr key={item.row} className="border-b border-border">
                  <th scope="row" className="py-3 pr-4 font-normal text-muted-foreground">
                    {item.row}
                  </th>
                  <td className="py-3 pr-4">{item.aether}</td>
                  <td className="py-3 text-muted-foreground">{item.other}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="limits" aria-labelledby="limits-title" className="mx-auto max-w-3xl space-y-6">
        <h2 id="limits-title" className="text-2xl font-light tracking-tight">
          Known limits
        </h2>
        <ul className="space-y-2 text-muted-foreground">
          {LIMITS.map((item) => (
            <li key={item} className="border-l border-border pl-4">
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section id="faq" aria-labelledby="faq-title" className="mx-auto max-w-3xl space-y-6">
        <h2 id="faq-title" className="text-2xl font-light tracking-tight">
          Questions
        </h2>
        <div className="divide-y divide-border border-y border-border">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                {item.q}
                <span aria-hidden="true" className="font-mono text-muted-foreground transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="pt-3 text-sm text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        <h2 className="text-3xl font-light tracking-tight">Try a sentence.</h2>
        <Link
          to="/create"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-primary-foreground"
        >
          Start creating
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
