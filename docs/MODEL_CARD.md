# Model card

- **Architecture:** UNet, 16.3M parameters, flow matching, 64x64 output, EMA weights, Euler sampler, classifier-free guidance (best around 3).
- **Training data:** Flickr8k, 8k images with 5 English captions each.
- **Licence status:** Flickr8k is research-use only. Weights trained on it must not be published. A release model needs a retrain on data whose licence allows it (see `docs/ml/DATASETS.md`).
- **Limits:** 64x64 resolution, soft faces, English captions only, small vocabulary, limited compositional ability.
- **Bias:** inherited from Flickr8k, which is skewed towards everyday outdoor scenes, people and dogs.
- **Not for:** safety-critical use, realistic depictions of real people, or any claim of originality of style.
