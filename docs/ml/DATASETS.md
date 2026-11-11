# Lexigraph datasets

Date: 2026-11-11. Read with `docs/ml/BUILD_PLAN.md` division 1.

Licence facts below are a starting point, not legal advice. Only PD12M was checked by web search on this date. For every dataset, open its licence page yourself, save a copy of the text with the date into `data/provenance/`, and record it in `data/provenance/datasets.json` before downloading. The model card must list exactly what was used.

## 1. What the dataset must satisfy

1. The licence allows training and publishing the trained weights.
2. Image-caption pairs in English, everyday subjects.
3. At least 256 pixels on the short side, so one download serves both the 64 and the 256 models.
4. Obtainable for free and storable on a laptop: target 300k pairs, about 4 GB at 64x64 uncompressed plus about 8 GB at 256x256 JPEG.

## 2. Candidates

| Dataset | Size | Captions | Licence status | Verdict |
|---|---|---|---|---|
| **PD12M** (Spawning) | 12.4M pairs | Synthetic (written by a captioning model; confirm which one on the dataset card) | Checked: CDLA-Permissive-2.0 for the dataset; images labelled Public Domain Mark or CC0; maintainers do not guarantee each item and run a takedown process | **Primary.** Use a 300k subset |
| Open Images + Localized Narratives | About 500k narrated images | Human, spoken then transcribed | From memory: images listed as CC BY 2.0 (the publisher says it did not verify each), annotations CC BY 4.0. Attribution required | Secondary, for human-written captions. Verify, and keep the attribution list |
| Museum open-access sets (The Met, Smithsonian, Rijksmuseum, National Gallery of Art) | Hundreds of thousands each | Titles and metadata, not captions | From memory: CC0 for the open-access portions | Optional art subset. Captions must be built from titles and tags |
| Wikimedia Commons, public-domain category | Very large | File descriptions, noisy | Per file; filter to PD and CC0 only | Optional, more work |
| Flickr8k (current) | 8k | Human, 5 per image | Research use only | **Do not publish weights trained on it.** Keep for local experiments |
| COCO | 118k | Human, 5 per image | Annotations CC BY 4.0; images are Flickr photos under mixed licences | Not for published weights |
| LAION subsets, Conceptual Captions | Millions | Alt text | Links to copyrighted web images | No |

Owner decision R2 (synthetic captions): PD12M captions were produced by another party's pretrained model. No weight of ours is initialised from it, so the "trained from random initialisation" claim holds, but the README must state plainly that training captions are machine-written. If the owner wants no pretrained model anywhere in the chain, use Open Images with Localized Narratives as the primary set instead. Default: PD12M, disclosed.

## 3. Evaluation and other data

| Need | Data | Note |
|---|---|---|
| Held-out validation | 5,000 pairs split from the training download by hash of the image id | Never trained on; fixed forever |
| Fixed prompt set | `training/eval/prompts.txt`, 64 prompts written by hand | Cover: single object, two objects, colour binding, counting, scenes, people, animals, text-free abstract. Version the file |
| Memorisation check | The training set itself | Nearest training image to each generated image |
| Codec comparison | The 5,000 validation images at 256x256 | Compare against JPEG and WebP at equal bytes |
| Background tiles for the UI | About 12 generated images | Our own outputs, so no licence question once the model is on licensed data |
| Prompt-policy tests | `server/tests/fixtures/prompts_block.txt` and `prompts_allow.txt`, written by hand | Not downloaded from anywhere |

## 4. Download and preparation pipeline (task M1)

All scripts under `training/data/`. Every stage is resumable and writes a manifest; no stage needs the GPU.

1. **`fetch_metadata.py`**: download the PD12M metadata (parquet files on the Hugging Face Hub, dataset `Spawning/PD12M`; confirm the column names on the card: expected image URL, caption, width, height, id). Keep rows with: short side at least 256, aspect ratio between 0.5 and 2.0, caption 5 to 60 words and ASCII letters only. Sample 330k rows with a fixed seed (10% spare for failures). Output `data/pd12m/meta.parquet`.
2. **`download.py`**: fetch images with 16 concurrent connections, a 20-second timeout, 2 retries, a descriptive User-Agent, and a pause on HTTP 429. Verify each decodes. Centre-crop to square, save 256x256 JPEG quality 92 to `data/pd12m/img256/<id-prefix>/<id>.jpg`. Append one line per image to `data/pd12m/manifest.jsonl`.
3. **`dedup.py`**: 64-bit perceptual hash (resize to 32x32 grey, 2D DCT, keep the top-left 8x8, threshold at the median). Bucket by the first 16 bits, compare within buckets, drop one of each pair within Hamming distance 4. Also drop images whose pixel standard deviation is under 8 (blank) and exact caption duplicates beyond 20 copies.
4. **`split.py`**: validation if `sha1(id) mod 60 == 0` until 5,000 are taken; the rest is train.
5. **`tokenizer.py`**: train byte-pair encoding on the training captions (lowercase, NFKC, 8,000 merges, special tokens PAD 0, UNK 1, BOS 2, EOS 3 to stay compatible with `flow.py`). Write `data/pd12m/bpe.json`. Our own implementation, about 150 lines, with a test that round-trips 1,000 captions.
6. **`pack.py`**: write shards of 10,000 samples: `img64_XXXX.npy` (uint8, N x 64 x 64 x 3, area-resized from the 256 JPEG), `tok_XXXX.npy` (int16, N x 48), and keep the 256 JPEGs in place for the codec. Write `data/pd12m/index.json` with shard list, counts, tokenizer hash.
7. **`report.py`**: dataset card numbers: counts kept and dropped per filter, caption length histogram, top 200 words, the first 16 PCA components of the 64x64 images rendered as pictures, and a 10x10 random sample grid. Output `docs/ml/DATA_CARD.md` and images in `docs/ml/img/`.

### Manifest record (`manifest.jsonl`, one JSON object per line)

```json
{"id": "pd12m_000123", "source": "PD12M", "url": "https://example.org/x.jpg", "licence": "CC0-1.0", "caption": "a wooden boat on a calm lake", "width": 1024, "height": 768, "sha256": "ab12...", "phash": "f0e1d2c3b4a59687", "split": "train", "fetched_at": "2026-11-12T10:15:00Z"}
```

Times are UTC in ISO 8601. `licence` is copied from the source metadata per item. `sha256` is of the saved 256x256 JPEG.

### Takedowns
`training/data/resync.py`: re-download the source's current id list monthly; any id no longer present is deleted locally and listed in `data/pd12m/removed.jsonl`. State in the model card which dataset revision and date the released weights were trained on.

## 5. Where training runs for free

- Local RTX 3050 6 GB: the 64x64 models, the judge, the codec at batch sizes that fit.
- Kaggle notebooks (free GPU quota per week; check the current hours and GPU type on Kaggle): the long runs. Upload the packed shards as a private Kaggle dataset. Sessions are time-limited, so `train.py` must checkpoint every 2,000 steps and resume from the latest checkpoint automatically.
- Checkpoints between machines: a private Hugging Face Hub repository or a Kaggle dataset version. Never commit checkpoints to git.
