# Lexigraph ML research: findings and conclusions

Date: 2026-11-11. Companions: `docs/ml/BUILD_PLAN.md` (tasks), `docs/ml/DATASETS.md` (data), `docs/OPEN_SOURCE_PLAN.md` (product).

How much to trust this: four papers and one dataset licence were checked by web search on this date (marked "checked"). Everything else is from the author's memory of the literature (marked "from memory"): the idea is right but verify the arXiv id and the exact numbers before quoting them anywhere public. No experiment in this document has been run. Every expected gain is a hypothesis until `BUILD_PLAN.md` task M0 produces numbers.

## 1. Where the model is today

Read from `training/models/t2i.py`, `training/models/flow.py`, `ml_service/t2i_service.py`:

| Part | Current | Limit it causes |
|---|---|---|
| Data | Flickr8k, about 8,000 images, 64x64 | The main limit. 16.3M parameters on 8k images memorises; variety and faces cannot improve |
| Tokenizer | Lowercase words by regex, vocabulary from Flickr8k, 24 tokens max | Any word outside the vocabulary becomes UNK; no numbers, no rare words |
| Text encoder | 4-layer transformer, width 256, trained jointly from the image loss only | Learns only what the image loss teaches; weak word understanding |
| Denoiser | Pixel-space UNet, channels 64/128/256/256, self and cross attention | Fine at 64x64; cost explodes at 256x256 in pixel space |
| Objective | Flow matching, uniform timestep, velocity target, 10% caption dropout | Spends equal effort on easy and hard noise levels |
| Sampler | Euler, 30 steps, classifier-free guidance 3 | 60 network calls per image; guidance oversaturates above 5 |
| Evaluation | Looking at sample grids | No number says whether a change helped |
| Output | 64x64, "upscale" is Lanczos resize | No real detail above 64 pixels |

## 2. The project rule and what it excludes

Rule: every weight is trained from random initialisation; no pretrained checkpoints. Several popular techniques break it, so they are out, with a from-scratch replacement:

| Common technique | Why it is out | Replacement here |
|---|---|---|
| CLIP or T5 text encoder | Pretrained | Own encoder with own BPE tokenizer, optionally pre-trained by our own contrastive model (division 6) |
| Stable Diffusion VAE | Pretrained | Own codec (division 2) |
| LPIPS perceptual loss | Uses pretrained VGG | L1 plus gradient loss plus a small discriminator trained from scratch |
| FID | Uses pretrained Inception | Fréchet distance in our own encoder's feature space; state clearly it is not comparable to published FID |
| REPA (aligning to DINOv2 features) | Uses pretrained DINOv2 | Not used |
| Synthetic captions | Written by someone else's pretrained model | Owner decision, see `DATASETS.md` section 2 |

Owner decision R1: may a pretrained network be used for measurement only (standard FID), never for training or generation? Default: no, keep the rule absolute; it is the project's identity.

## 3. Findings, by division

### Division 1: data engine
More and cleaner data beats every architecture change at this scale. Target 300k image-caption pairs from a source whose licence allows publishing trained weights (PD12M, checked: CDLA-Permissive-2.0, images labelled public domain or CC0, maintainers do not guarantee every item). Classical tools do the cleaning: perceptual hashing for near-duplicates, simple filters for size and caption quality, byte-pair encoding for the tokenizer (an algorithm, not a model: it is trained on our own captions).

### Division 2: compression (the codec)
A learned image codec is the piece most small projects skip and it pays three times:
1. **It makes 256x256 affordable.** An autoencoder that turns 256x256x3 into a 32x32 grid of codes lets the generator work on 1,024 positions instead of 65,536 pixels, the same cost as today's 64x64 pixel model.
2. **It is a real compression result.** With finite scalar quantisation (FSQ: round each latent channel to a few levels; no codebook, no codebook collapse; from memory, arXiv 2309.15505) the latent is a grid of integers. Feed those to a range coder (rANS or arithmetic coding, classical entropy coding) and the image becomes a small file. Plot quality against bytes next to JPEG and WebP. That plot is a headline figure.
3. **It enables "the image is the link".** A 64x64 result coded to roughly 100 to 300 bytes fits in a URL. Anyone opening the link decodes it in the browser with the same small decoder.

Also in this division, compression of the model itself: 16-bit floats, 8-bit integers, and k-means weight sharing with Huffman coding (Deep Compression, from memory arXiv 1510.00149), each reported as download size against quality. This matters directly for browser mode.

Ordered token codecs (the first tokens carry the coarse image, later ones add detail, so any prefix decodes to a plausible image) exist: FlexTok (checked, ICML 2025, nested dropout plus a rectified-flow decoder). Adopt the nested-dropout trick in our codec so one file can be truncated to any size. Do not claim it as new.

### Division 3: generative core
- **Timestep sampling.** Sample training timesteps from a logit-normal instead of uniform, so the middle noise levels get more updates (Stable Diffusion 3 paper, from memory arXiv 2403.03206). One-line change.
- **Prediction target.** "Back to Basics" (checked, Li and He, arXiv 2511.13720, CVPR 2026) shows that predicting the clean image works far better than predicting noise or velocity when patches are high-dimensional, and that at 64x64 with small patches the gap is narrow. Conclusion: ablate it at 64 (expect little change), and make clean-image prediction the default for the 256 pixel-space variant if one is built.
- **Architecture.** Move from UNet to a plain transformer over patches (DiT, from memory arXiv 2212.09748; U-ViT, 2209.12152) with rotary position encoding and text tokens joined into the same sequence. Same code then serves 64x64 pixels (patch 4) and 32x32 latents (patch 2), both 256 tokens.
- **Guidance.** Three cheap upgrades: apply guidance only in the middle of sampling (guidance interval, from memory arXiv 2404.07724); autoguidance (checked, Karras et al., arXiv 2406.02507), which guides with a weaker version of the same model, for example an earlier checkpoint, and needs nothing pretrained; and a second-order Heun sampler for fewer steps at equal quality.
- **Text.** Byte-pair tokenizer at 8k vocabulary, 48 tokens, 6 layers.

### Division 4: speed
- **Reflow** (rectified flow, from memory arXiv 2209.03003): sample noise-image pairs from our own model, retrain on those straight pairs, and the paths become straight enough for about 4 steps. Simple and reliable.
- **MeanFlow** (checked, Geng et al., arXiv 2505.13447, NeurIPS 2025): trains a network to predict average velocity over an interval, giving one-step generation from scratch with no teacher. Research-grade: it needs a Jacobian-vector product in the loss and careful tuning. Run it as an experiment after reflow works, not instead of it.
- **Why it matters for the product:** at 1 to 4 steps the browser can draw a preview while the visitor types, then refine on Enter.

### Division 5: super-resolution cascade
A second small flow model that turns 64x64 into 256x256, conditioned on the blurry input with noise added to it during training (cascaded diffusion and Imagen, from memory arXiv 2106.15282 and 2205.11487). It replaces the Lanczos "upscale" with real generated detail and reuses the existing 64x64 model. It competes with the latent route of division 2; build the latent route first and keep the cascade as the honest upgrade for the upscale button.

### Division 6: the judge (own contrastive model)
Train a small image encoder and text encoder with a contrastive loss on our own pairs (the CLIP method, trained from scratch). It gives, with no pretrained weights: a text-image agreement score, "generate four and keep the best" reranking, the feature space for our Fréchet distance, a memorisation check by nearest neighbour against the training set, and a better starting point for the generator's text encoder.

### Division 7: seeing inside
Cross-attention heat maps per word (which word drew which pixels), the denoising trajectory as a film strip, straight-line and spherical interpolation between seeds and between prompts, and a two-dimensional map of prompt embeddings by PCA. All are classical analysis on our own activations and all are things an interviewer can click.

### Division 8: orchestration
One command-line entry for the whole pipeline (data, tokenizer, codec, train, evaluate, export), configuration files hashed into every run, a run index, checkpoints saved at fixed fractions of training, a promotion gate (a model is only exported if it beats the current one on the evaluation), and a model registry file read by both ml_service and the browser.

## 4. The original research track: Foresight Guidance

This is the part intended to be new. Status: a hypothesis with a literature check of one search, which found single-checkpoint autoguidance and two related methods (guidance from internal layers; weak-to-strong segmented guidance) but nothing that extrapolates across several training checkpoints. Before claiming novelty anywhere, search again for "checkpoint extrapolation guidance", "learning curve extrapolation diffusion", "Richardson extrapolation diffusion guidance" and "Aitken guidance". Write it up as "we explore", not "we are first".

### The idea in one paragraph
Autoguidance improves a model by pushing its output away from the output of a worse version of itself, with a hand-tuned strength. A model's earlier checkpoints are a sequence of worse versions, and that sequence is converging somewhere. Numerical analysis has classical tools for predicting the limit of a converging sequence from its last few terms: Richardson extrapolation and Aitken's delta-squared method. Foresight Guidance applies them to the denoiser's outputs across checkpoints, at every sampling step, to estimate what a longer-trained model would have predicted. The guidance strength stops being a tuned constant and becomes a quantity computed from the model's own training history.

### Formulation
Keep exponential-moving-average checkpoints at training steps spaced by a factor of two: `s, 2s, 4s` (for example 25k, 50k, 100k). At a sampling point `(x_t, t, c)` call their velocity outputs `v1, v2, v3`.

Assume each output converges like a learning curve: `v_k = v_inf + a * s_k^(-p)`. Then:
- With a known exponent `p`, Richardson gives `v_inf = v3 + (v3 - v2) / (2^p - 1)`. This is exactly autoguidance with strength `w = 1 / (2^p - 1)`: the method explains what the tuned constant means.
- With three checkpoints `p` need not be known. Let `d2 = v2 - v1`, `d3 = v3 - v2`, and `rho = <d3, d2> / <d2, d2>` (how much of the last improvement repeats the one before). Then `w = rho / (1 - rho)`, clipped to `[0, w_max]`, and `v_hat = v3 + w * d3`. This is Aitken's method with the ratio taken as a projection so it is stable.
- `rho` can be computed per sample, per sampling step, and per frequency band (split `d2`, `d3` with a Haar wavelet transform and compute one `rho` per band). Coarse structure converges early in training and fine detail late, so the bands should get different strengths.

Then two extensions:
- **Distil it.** Train a student to regress onto `v_hat`. The student gets the benefit in one network call instead of three.
- **Iterate it.** Treat the student as the new last checkpoint and repeat. Measure whether gains compound or stall.

### What would prove or kill it
| Hypothesis | Test | It fails if |
|---|---|---|
| H1: computed strength matches tuned autoguidance | Same model, same seeds; compare Foresight (no tuning) with autoguidance swept over strength | Foresight is worse than the best tuned autoguidance by more than the seed-to-seed noise |
| H2: per-band strength helps | Scalar `rho` against per-band `rho` | No difference |
| H3: distillation keeps the gain | Student at 1x cost against teacher with guidance at 3x cost | Student is no better than the unguided teacher |
| H4: iteration compounds | Two more rounds | Round 2 is no better than round 1 (still a result: report it) |

Known risks: checkpoint differences may be mostly optimiser noise, not learning (mitigation: use EMA checkpoints and average `rho` over the batch); `rho` near or above 1 means no convergence (the clip handles it; log how often it triggers); the power-law assumption may not hold at every noise level (plot `rho` against `t`: that plot is itself a finding).

Cost: no new training for H1 and H2 beyond saving three checkpoints, which the retraining on new data needs anyway. Three network calls per step during sampling.

Whatever the outcome, the write-up is honest research: a clear idea from classical numerical analysis, a controlled comparison, and plots. A negative result with a good explanation is still a strong portfolio piece.

## 5. Conclusion: what Lexigraph becomes

One sentence for the README: a complete text-to-image system built from nothing on a 6 GB GPU (its own tokenizer, text encoder, image codec, generator, judge and super-resolver), small enough to run in a browser, with one original sampling method that uses the model's own training history.

The process, named so it can be described in an interview, is **scratch-to-browser**: (1) licensed data in, cleaned with classical methods; (2) a codec that is both the generator's workspace and a real compression format; (3) a flow-matching transformer in that space; (4) a judge trained on the same data that scores, reranks and evaluates; (5) straightening and distillation down to a few steps; (6) export, quantise and run on the visitor's device; (7) every step measured, gated and reproducible from one command.

Order of payoff per hour of work: data (division 1), evaluation (M0 and division 6), recipe fixes (division 3), then the codec and 256 pixels, then speed, then Foresight Guidance once checkpoints exist.

## 6. Sources checked on 2026-11-11

- [Public Domain 12M paper](https://arxiv.org/pdf/2410.23144) and [dataset card](https://huggingface.co/datasets/Spawning/PD12M)
- [Mean Flows for One-step Generative Modeling](https://arxiv.org/html/2505.13447v1)
- [Back to Basics: Let Denoising Generative Models Denoise](https://arxiv.org/pdf/2511.13720)
- [Guiding a Diffusion Model with a Bad Version of Itself](https://arxiv.org/pdf/2406.02507)
- [FlexTok: Resampling Images into 1D Token Sequences of Flexible Length](https://arxiv.org/abs/2502.13967)
- [Guiding a Diffusion Transformer with the Internal Dynamics of Itself](https://arxiv.org/html/2512.24176v1)
- [Improving Diffusion Generalization with Weak-to-Strong Segmented Guidance](https://arxiv.org/pdf/2603.20584)
- [Diffusion Transformers with Representation Autoencoders](https://arxiv.org/pdf/2510.11690) (notes earlier checkpoints as guides)
