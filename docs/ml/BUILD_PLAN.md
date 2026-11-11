# Lexigraph ML build plan

Date: 2026-11-11. For the engineer or coding agent building the ML side, one task per session. Why each item exists is in `docs/ml/RESEARCH.md`; data details are in `docs/ml/DATASETS.md`. Nothing here has been run: sizes, parameter counts and targets are design estimates to be replaced by measurements.

## 0. Ground rules

- All weights from random initialisation. No pretrained checkpoint is downloaded for any purpose (see RESEARCH section 2).
- Existing code to build on, do not rewrite without need: `training/models/t2i.py` (UNet, text encoder), `training/models/flow.py` (loss, sampler, EMA), `training/train_t2i.py`, `training/common/` (seed, config, run record), `ml_service/t2i_service.py`.
- Every run writes `runs/<id>/config.json`, `run.json`, checkpoints, and (after M0) `eval.json`. A change is "better" only if `eval.json` says so on the fixed prompts and seeds.
- Every training script must resume from its latest checkpoint and must run on 6 GB (use mixed precision, gradient checkpointing and gradient accumulation; state the effective batch size in the config).
- Each task ends with its check passing and the numbers pasted into the hand-off note. Report failures as plainly as successes.
- New Python dependencies allowed: `numpy`, `pillow`, `pyarrow`, `requests`, `safetensors`, `onnx`, `onnxruntime`, `pyyaml`, `matplotlib`, `pytest`. Anything else: ask.

## 1. Target layout

```
training/
  cli.py                 python -m training.cli <data|tokenizer|codec|train|judge|eval|export|pipeline>
  configs/               one YAML per experiment; hashed into run ids
  data/                  fetch_metadata, download, dedup, split, tokenizer, pack, report, resync, loader
  models/
    t2i.py flow.py       existing
    lexit.py             transformer denoiser (M3.2)
    codec.py fsq.py      autoencoder + quantiser (M2)
    judge.py             contrastive model (M6)
    sr.py                super-resolution model (M5)
  coding/                rans.py, lexi_format.py, weight_compress.py
  guidance/              cfg.py, autoguidance.py, foresight.py
  distill/               reflow.py, meanflow.py
  eval/                  prompts.txt, harness.py, metrics.py, memorisation.py
  export/                safetensors.py, onnx.py, quantise.py, registry.py
  tests/                 pytest, CPU only, tiny tensors
models/registry.json     which model files are current; read by ml_service and the browser
docs/ml/                 RESEARCH, DATASETS, BUILD_PLAN, DATA_CARD, RESULTS (one table per experiment)
```

## 2. Division 0: measurement first

### M0.1 Evaluation harness (M)
- Files: `training/eval/prompts.txt` (64 hand-written prompts, see DATASETS section 3), `harness.py`, `metrics.py`, `memorisation.py`.
- Behaviour: `python -m training.cli eval --run <id>` loads the EMA weights, generates each prompt at seeds 0 to 3 with the run's default sampler, and writes `runs/<id>/eval/grid.png` and `eval.json` with: validation flow loss in 10 timestep bins (5,000 held-out pairs, fixed noise seed); mean nearest-training-image distance (generated and training images downsampled to 16x16, L2) and the 8 closest pairs saved as a picture; seconds per image; parameter count. After M6 it adds agreement score and Fréchet distance in judge features.
- Check: running it twice on the current checkpoint gives identical `eval.json`. Baseline numbers for the Flickr8k model recorded in `docs/ml/RESULTS.md`.

### M0.2 Configs, checkpoints, registry (S)
- YAML config per experiment; run id is date plus name plus the first 8 hex of the config hash. `runs/index.jsonl` gets one line per run (id, config path, git commit if any, dataset index hash, final metrics).
- Save EMA checkpoints at 12.5%, 25%, 50% and 100% of training in addition to the rolling latest (needed for autoguidance, Foresight Guidance and the "training replay" UI).
- `torch.load(..., weights_only=True)` everywhere (audit H6). Export to `safetensors`.
- Check: a 200-step smoke run on CPU with a tiny config produces all four checkpoints, an index line, and resumes correctly when killed at step 100.

## 3. Division 1: data engine (M1, size L, split across sessions)

Build the seven scripts exactly as specified in DATASETS section 4, one or two per session. Add `training/data/loader.py`: memory-maps the shards, yields `(uint8 image batch, int16 token batch)`, random horizontal flip only when the caption has no "left" or "right", worker-free (memmap is fast enough).
- Check per script: a `pytest` on a 50-image fixture. Check for the whole: `index.json` reports at least 280k training pairs, `docs/ml/DATA_CARD.md` exists with the drop counts, and a 20k-step run of the unchanged UNet on the new data produces a recognisable grid.

## 4. Division 3 (first half): fix the recipe on the existing model

### M3.1 Recipe ablations (M)
Each ablation is the current UNet on the new data, 20k steps, same seed, one change at a time, judged by M0.1. Keep a change only if it wins.
1. Logit-normal timestep sampling: `t = sigmoid(randn * 1.0 + 0.0)`.
2. Target: velocity (current) against clean-image prediction with the loss still computed on velocity (`v = (x_t - x0_pred) / t`, clamp `t` at 0.05).
3. Byte-pair tokenizer and 48 tokens against the word tokenizer.
4. Learning rate: constant against 2k warm-up then cosine.
5. Caption dropout 10% against 15%.
6. EMA decay 0.999 against 0.9999.
Then one 100k-step run with all winners. Record everything in `RESULTS.md` as a table with one row per run.
- Check: the combined run beats the unchanged baseline on validation loss in at least 7 of 10 timestep bins, and the grid is visibly better. If it does not, say so and keep the baseline.

## 5. Division 6: the judge

### M6.1 Train the contrastive model (M)
- `training/models/judge.py`: image tower is a small vision transformer (64x64 input, patch 8, width 256, depth 6, about 5M parameters); text tower reuses `TextEncoder` with the byte-pair vocabulary; both project to 256 dimensions, L2-normalised; learnable temperature; symmetric InfoNCE loss. Batch 512 at 64x64 with mixed precision; augment images with random resized crop (scale 0.6 to 1) only.
- Check: on the 5,000 validation pairs, text-to-image recall@1, @5, @10 are reported and recall@10 is far above chance (chance is 0.2%; expect tens of percent, record what you get).

### M6.2 Put it to work (S)
Add to `metrics.py`: agreement score (mean cosine between prompt and generated image), Fréchet distance between judge features of 5,000 generated and 5,000 validation images (label it "FD-judge", never "FID"), reranking (`--best-of 4` keeps the highest-agreement sample), and nearest-neighbour memorisation in judge space. Optional: initialise the generator's text encoder from the judge's text tower and compare.
- Check: agreement score for matched prompts is higher than for shuffled prompts on the same images by a clear margin; if not, the judge is too weak to use as a metric and that is the finding.

## 6. Division 3 (second half): the transformer

### M3.2 LexiT denoiser (L)
- `training/models/lexit.py`. Input: tensor `[B, C, H, W]` plus timestep plus text tokens. Patchify with patch `p` to `(H/p)*(W/p)` tokens; linear embed to width `d`; concatenate the text encoder's output tokens (projected to `d`) in front of the image tokens, so one sequence is attended jointly; 2D rotary position encoding on image tokens, 1D on text tokens; pre-norm blocks with RMSNorm, multi-head self-attention, MLP ratio 4; timestep enters through adaptive norm scale and shift, with the final layer zero-initialised; unpatchify. Sizes: `S` = width 384, depth 12, 6 heads (design estimate about 22M parameters). Config flag for pixel (`C=3, H=64, p=4`) or latent (`C=codec channels, H=32, p=2`): both give 256 image tokens.
- Unit tests: output shape; zero-init means output is zero at step 0; dropping the caption changes the output; runs at batch 2 on CPU.
- Check: 100k steps at 64x64 pixels with the M3.1 recipe, compared with the UNet at equal steps on every M0 metric and on seconds per image. Keep whichever wins; if the UNet wins at 64, still keep LexiT for the latent model.

### M3.4 Guidance and sampler (M)
`training/guidance/`: (a) guidance interval: apply classifier-free guidance only for `t` in `[0.3, 0.8]` (sweep the bounds); (b) autoguidance: `v = v_main + w * (v_main - v_weak)` with the 25% checkpoint as the weak model, sweep `w` in 0.5 to 3, with and without classifier-free guidance; (c) Heun second-order sampler; (d) step-count sweep 4, 8, 16, 30 for Euler and Heun. Output one table and one plot (quality against network calls).
- Check: a recommended default (sampler, steps, guidance) is chosen from the table and written into the model registry.

## 7. Division 2: compression

### M2.1 Wavelet baseline (S)
`training/coding/haar.py`: one-level Haar transform and inverse as pure tensor ops (64x64x3 to 32x32x12 and back), exact to floating-point error. Used by Foresight Guidance (per-band `rho`) and as a no-training comparison point for the codec.
- Check: round-trip error under 1e-5.

### M2.2 LexiCodec (L)
- `training/models/codec.py`, `fsq.py`. Encoder: 256x256x3, three stride-2 stages with residual blocks, channels 64/128/256, to 32x32x`k`; FSQ with levels `[8, 5, 5, 5]` (`k=4`, 1,000 codes per position; straight-through rounding after `tanh` bounding); decoder mirrors the encoder. About 10M parameters. Also train a 64x64 variant (two stages, 16x16 codes) for the image-in-URL feature.
- Loss: L1 + 0.5 x L1 on image gradients (Sobel) + after 20k steps a hinge GAN loss from a small PatchGAN discriminator trained from scratch (weight 0.1). No LPIPS.
- Nested dropout for ordered codes (optional second phase): during training, zero all latent positions after a random prefix length in a fixed coarse-to-fine scan order, so truncated files still decode.
- Check: on the 5,000 validation images report PSNR and SSIM, and a reconstruction grid. Design target, to be confirmed: PSNR at least 26 dB at 256x256. Code-usage histogram shows no dead levels.

### M2.3 Entropy coding and the `.lexi` format (M)
- `training/coding/rans.py`: range asymmetric numeral system coder over the FSQ indices, with an adaptive frequency model conditioned on the code above and to the left (classical context modelling; no neural network in the first version). `lexi_format.py`: header (magic `LEXI`, version, model hash 8 bytes, height, width) then the coded stream.
- A TypeScript decoder (`client/src/lib/lexiCodec.ts`) that produces identical indices; the decoder network runs through the same ONNX path as the generator.
- Check: encode-decode round trip is bit-exact in Python and in TypeScript on 100 images. A rate-distortion plot: PSNR against bytes for LexiCodec, JPEG and WebP at matched sizes on the validation images. Report honestly where JPEG wins.

### M2.4 Image-in-URL (S, needs the browser build)
A share link carries the base64url of the `.lexi` bytes of the 64x64 result plus the prompt and seed. Opening it decodes locally with no server. Check: links under 600 characters for 95% of results; a link opened in a clean browser profile shows the same image.

### M2.5 Compressing the model (M)
`training/coding/weight_compress.py` and `export/quantise.py`: 16-bit float export; 8-bit dynamic quantisation in ONNX Runtime; k-means weight sharing (256 centroids per layer, then Huffman-coded indices). Table: download size, FD-judge, agreement score, seconds per image on CPU, for each.
- Check: the table exists; the registry's browser entry points at the smallest variant whose FD-judge is within 5% of full precision.

### M3.3 Latent model at 256 (L)
Encode the whole training set once to FSQ latents (store the pre-quantisation floats, about 1.2 GB for 300k at 32x32x4 float16), then train LexiT in latent mode with the M3.1 recipe. Generation: sample latents, quantise, decode.
- Check: 256x256 samples on the fixed prompts; M0 metrics computed after area-downsampling to 64 for comparison with the pixel model, plus the 256 grid for human judgement.

## 8. Division 4: speed

- **M4.1 Reflow (M).** `training/distill/reflow.py`: generate 200k (noise, image, caption) triples with the best model at its best sampler; train a copy of the model on straight lines between those pairs; evaluate at 1, 2, 4 and 8 Euler steps without guidance (bake the guidance into the pairs). Check: the 4-step student is within 10% of the 30-step teacher on FD-judge, or the gap is reported.
- **M4.2 MeanFlow experiment (L, research risk).** `training/distill/meanflow.py`: the network takes two times `(r, t)` and predicts average velocity; the loss uses the MeanFlow identity with a Jacobian-vector product (`torch.func.jvp`) and a stop-gradient target, as in the paper. Start from the paper's hyperparameters, on the 64x64 pixel LexiT only. Check: 1-step samples compared with reflow's 1-step and 4-step. If it does not train stably in three attempts, write up what happened and stop.
- **M4.3 Preview-then-refine (S, product).** The registry exposes a "preview" model (few-step student) and a "full" model. The client generates a preview 400 ms after typing stops and the full image on Enter, with the same seed.

## 9. Division 5: super-resolution (M5, size L, optional after M3.3)

`training/models/sr.py`: LexiT or UNet at 256x256 pixel space is too costly, so run it in the Haar domain (128x128x12 with patch 8) or as a UNet with attention only at the lowest resolution. Condition by concatenating the bicubic-upsampled 64x64 image, corrupted during training with Gaussian noise of a random level that is also given to the network. Check: 64-to-256 results against Lanczos on validation images (PSNR is not the point; show crops), and it replaces the `/ml/upscale` implementation.

## 10. Division 7: seeing inside (each S)

- **M7.1 Attention maps.** Hook the attention weights from image tokens to each text token, average over heads and the middle third of steps, return a 16x16 map per word. API returns them with the image; the UI highlights the region when a word is hovered.
- **M7.2 Trajectory.** Return the predicted clean image at 8 evenly spaced steps as a film strip.
- **M7.3 Interpolation.** Spherical interpolation between two seeds' noise and linear interpolation between two prompts' text embeddings, 8 frames, shown as a loop.
- **M7.4 Prompt map.** PCA to two dimensions of the judge's text embeddings for the 2,000 most common caption phrases; a static JSON the UI can plot.
- **M7.5 Training replay.** The same prompt and seed rendered from the 12.5%, 25%, 50% and 100% checkpoints.

## 11. Research track: Foresight Guidance (R, needs M0.2 checkpoints from a full run)

Definition and hypotheses are in RESEARCH section 4. Do a second literature search first and record the queries and findings in `docs/ml/FORESIGHT.md`.

- **R1 (M).** `training/guidance/foresight.py`: load three EMA checkpoints at steps `s, 2s, 4s`. At each sampling step compute `v1, v2, v3` (one batched call of each), `d2 = v2 - v1`, `d3 = v3 - v2`, `rho = sum(d3*d2) / (sum(d2*d2) + 1e-8)` per sample, `w = clamp(rho / (1 - rho), 0, w_max)` with `w_max = 4`, and step with `v3 + w * d3`. Options: `--per-band` (apply the Haar transform to `d2` and `d3` and compute `rho` per subband), `--with-cfg`. Log `rho` and `w` per step.
- **R2 (S).** Experiments H1 and H2: baselines are no guidance, classifier-free guidance at its best strength, autoguidance swept over strength. Same 64 prompts, 4 seeds, plus 5,000 samples for FD-judge. Three repeats with different sampling seeds to estimate noise. Output: one table, a plot of `rho` against `t`, a grid.
- **R3 (L).** H3: distil. Loss is the mean squared error between the student's velocity and the stop-gradient Foresight target on real training pairs; initialise the student from the last checkpoint; 30k steps. H4: repeat twice more.
- **R4 (S).** Write `docs/ml/FORESIGHT.md`: idea, derivation, what was tested, results including failures, limits, related work found. This is the piece to link from a resume.
- Check: every hypothesis in RESEARCH section 4 has a row marked supported, not supported or inconclusive, with the numbers.

## 12. Division 8: orchestration and export

- **M8.1 CLI and pipeline (M).** `python -m training.cli pipeline --config configs/<x>.yaml` runs data check, train, eval, and the promotion gate in order, skipping stages whose outputs exist and whose config hash is unchanged.
- **M8.2 Promotion gate (S).** A run is promoted (copied to `models/`, added to `registry.json`) only if FD-judge and agreement are no worse than the current entry and the memorisation distance has not dropped by more than 10%. `--force` exists and is logged.
- **M8.3 Registry (S).** `models/registry.json`: for each role (`full`, `preview`, `codec`, `judge`, `sr`) the file name, SHA-256, format, training run id, dataset index hash, default sampler settings, licence note. ml_service loads from it and verifies the hash; the browser build fetches it.
- **M8.4 ONNX export (M).** Denoiser, text encoder, codec decoder; fixed spatial size, dynamic batch; a parity test that ONNX Runtime output matches PyTorch within 1e-3; a TypeScript tokenizer with a shared test-vector file so Python and browser tokenise identically.
- **M8.5 Kaggle runner (S).** A notebook that installs requirements, mounts the shard dataset, resumes the named run from the latest checkpoint on the Hub, trains until 20 minutes before the session limit, and uploads the checkpoint.
- **M8.6 Results page (S).** A script that turns `runs/index.jsonl` and each `eval.json` into `docs/ml/RESULTS.md` and a static HTML page with the grids, so progress is visible in the repository.

## 13. Order

| Step | Tasks | Why now |
|---|---|---|
| 1 | M0.1, M0.2 | Nothing can be judged without them |
| 2 | M1 (all) | Data is the largest gain |
| 3 | M3.1 | Cheap wins on the existing model |
| 4 | M6.1, M6.2 | Gives the real metrics every later step needs |
| 5 | M3.2, M3.4 | New backbone and sampling defaults |
| 6 | R1, R2 | Checkpoints now exist; the research result arrives early |
| 7 | M8.3, M8.4, M2.5 | Browser mode becomes possible (plan task F1 in `docs/OPEN_SOURCE_PLAN.md`) |
| 8 | M2.1, M2.2, M2.3, M2.4 | The codec and the image-in-URL feature |
| 9 | M3.3 | 256x256 |
| 10 | M4.1, M4.3 | Few-step and preview-as-you-type |
| 11 | M7.1 to M7.5 | The inspectable demo |
| 12 | R3, R4, M4.2, M5, M8.1, M8.2, M8.5, M8.6 | Depth, write-up and polish |

Steps 1 to 6 are the minimum that changes what the project is. Stop and release after any step; each leaves a working system.

## 14. Open decisions for the owner

- R1: pretrained networks for measurement only (standard FID): default no.
- R2: synthetic captions (PD12M) or human captions (Open Images narratives): default PD12M, disclosed.
- R3: compute: how many Kaggle hours a week are available; the plan assumes long runs go there.
