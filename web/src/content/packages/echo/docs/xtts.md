# XTTS-v2 engine

[Coqui XTTS-v2](https://huggingface.co/coqui/XTTS-v2) through the maintained
[`coqui-tts`](https://github.com/idiap/coqui-ai-TTS) fork: zero-shot cloning from several reference clips, 17
languages, and streaming within a sentence. About 2 GB of VRAM, so it fits an 8 GB card. It is the suite's
cloning engine (argus-echo#51): clone voices here, and fine-tune it with argus-forge.

Source: [engines/xtts/xtts_server.py](../engines/xtts/xtts_server.py). Contract: [api.md](api.md). Published on
`8141` by `compose.yaml` (`--profile xtts`).

**Licence:** the XTTS-v2 weights are under the [Coqui Public Model Licence](https://coqui.ai/cpml), which allows
non-commercial use only. The image bakes them in and accepts that licence at build time (`COQUI_TOS_AGREED=1`).

## Settings

| Variable | Default | Effect |
| --- | --- | --- |
| `XTTS_MODEL` | `tts_models/multilingual/multi-dataset/xtts_v2` | Coqui model name |
| `XTTS_DEVICE` | `cuda:0` | `cuda:N` or `cpu` |
| `XTTS_PRELOAD` | `0` | `1` loads the model at startup |
| `XTTS_USE_DEEPSPEED` | `0` | `1` uses DeepSpeed inference (needs it installed) |
| `XTTS_KEEP_ALIVE_GPU` | `120` | Idle seconds on the GPU before moving to CPU. Negative = never |
| `XTTS_KEEP_ALIVE_CPU` | `600` | Idle seconds on CPU before unloading. Negative = never |
| `XTTS_TEMPERATURE` | `0.7` | Default sampling temperature |
| `XTTS_STREAM_CHUNK_SIZE` | `20` | Tokens per streamed chunk; lower means an earlier first byte |
| `XTTS_CPU_FALLBACK` | `1` | When the model can't be moved onto the GPU (CUDA out of memory), `1` runs the request on the CPU; `0` answers `503` with the reason |
| `XTTS_OOM_RETRY_AFTER_S` | `30` | `Retry-After` on that `503` |
| `XTTS_GPT_COND_LEN` | `30` | Seconds of reference audio the conditioning latent draws on (clips are ordered best first) |
| `XTTS_GPT_COND_CHUNK_LEN` | `4` | Chunk length for that conditioning |
| `XTTS_MAX_REF_LEN` | `30` | Longest reference used, in seconds |
| `XTTS_MAX_CLIPS` | `16` | Most clips per `/clone-voice` or `/analyze-clips`; more is `413` |
| `XTTS_CLIP_MAX_BYTES` | `16777216` | Largest clip (16 MiB); larger is `413` |
| `XTTS_ANALYZE_THRESHOLD` | `60` | `/analyze-clips` score below which a clip is left out by default |
| `XTTS_CHECKPOINT_ROOT` | empty | Directory of fine-tuned checkpoints `POST /admin/load` may load; empty, the route answers `503`. Compose sets `/checkpoints` and mounts the host's `XTTS_CHECKPOINT_ROOT` (default `./checkpoints/xtts`) there read-only. See [below](#fine-tuned-checkpoints) |
| `ECHO_VERSION`, `ECHO_REVISION` | empty | The release and git commit, set at image build time (build args); `/health` reports them as `image` |
| `ARGUS_ADMIN_TOKEN`, `ARGUS_ADMIN_INSECURE` | empty | See [api.md#security](api.md#security) |

Reference-clip preprocessing, applied to each clip before the latents are computed:

| Variable | Default | Effect |
| --- | --- | --- |
| `XTTS_PREPROCESS` | `1` | `0` skips all preprocessing |
| `XTTS_PREPROCESS_SR` | `24000` | Resample to this rate |
| `XTTS_PREPROCESS_HIGHPASS_HZ`, `XTTS_PREPROCESS_HIGHPASS_ORDER` | `85`, `4` | High-pass filter |
| `XTTS_PREPROCESS_VAD`, `XTTS_PREPROCESS_VAD_PAD` | `1`, `0.1` | Trim non-speech with Silero VAD, keeping this much padding (s) |
| `XTTS_PREPROCESS_DENOISE`, `XTTS_PREPROCESS_DENOISE_PROP`, `XTTS_PREPROCESS_DENOISE_SNR_DB` | `1`, `0.75`, `30` | Stationary denoise seeded from the VAD gaps, applied only below this SNR |
| `XTTS_PREPROCESS_LUFS` | `-23.0` | Loudness target |
| `XTTS_PREPROCESS_MAX_SECONDS` | `30` | Longest clip kept |

Storage is S3 only: `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` (compose:
`XTTS_S3_BUCKET`, default `voice-xtts`) and `S3_PUBLIC_URL` (compose: `XTTS_S3_PUBLIC_URL`). The bucket must exist.
`S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` have no default: the server refuses to start without both, and
likewise when `S3_ENDPOINT_URL` is not an http(s) URL (an empty one used to fail each `/synthesise` after
rendering) or `S3_BUCKET_NAME` is empty.

## GPU memory and CPU fallback

The model moves unloaded → CPU → GPU on demand and back after `XTTS_KEEP_ALIVE_GPU` / `XTTS_KEEP_ALIVE_CPU` idle
seconds. Work that uses it holds a lease for its whole duration (a stream's included), and nothing moves or
unloads the model while a lease is held.

- **A promotion that fails puts the weights back.** If moving the model onto the GPU raises, the weights are moved
  back to the CPU and the CUDA cache is emptied, so the state (`cpu`) always matches where the weights are. For a
  CUDA out-of-memory the request then runs on the CPU (`XTTS_CPU_FALLBACK=1`, the default) or answers `503` with
  the reason and `Retry-After: $XTTS_OOM_RETRY_AFTER_S` (`0`), on every route that uses the model.
  `/admin/wake` answers that `503` either way (it has no work to run on the CPU). Any other failure gets the same
  clean-up and is raised (a `500`). The next request tries the GPU again.
- **`device: "cpu"` never promotes.** A synthesis request with it uses the model where it is: loaded onto the CPU
  if it was unloaded, left on the GPU if it is already there (it holds that VRAM either way).
- **CPU work pins the model to the CPU.** While a lease runs on the CPU, the model isn't moved: a GPU request
  that arrives then joins it on the CPU, and `/admin/wake` loads but doesn't promote. The first GPU request after
  the CPU work ends promotes the model.

`/synthesise` returns `device` and `/synthesise/stream` sends `X-XTTS-Device`, each `cpu` or `XTTS_DEVICE`, so a
client can tell a CPU run (several times slower) from a GPU one. `/health`'s `model_state` says the same.

## Fine-tuned checkpoints

`POST /admin/load {"checkpoint": "<name>"}` replaces the stock XTTS-v2 weights with a fine-tune from
`XTTS_CHECKPOINT_ROOT/<name>`; `/admin/unload` goes back to stock. Statuses, what happens to requests meanwhile,
and how long a checkpoint stays selected: [api.md](api.md#fine-tuned-checkpoints).

A checkpoint directory holds what `Xtts.load_checkpoint` reads:

| File | Required | What |
| --- | --- | --- |
| `config.json` | yes | The fine-tune's `XttsConfig` (its `"model"` must be `"xtts"`) |
| `model.pth` | yes | The weights. Coqui's GPT trainer writes `best_model.pth` / `checkpoint_<step>.pth`: copy or symlink the one you want to `model.pth` (a symlink must stay inside the root). Its `xtts.`-prefixed keys and trainer-only modules are handled by the loader |
| `vocab.json` | yes | The tokenizer, copied from the base model the fine-tune started from (the trainer's `tokenizer_file` would point at a path on the training machine) |
| `speakers_xtts.pth` | no | Built-in speakers. Without it the checkpoint has none, so a request needs a `voice_clone_id` |

Other files (training logs, other `checkpoint_*.pth`) are ignored and not hashed. The root is mounted read-only, so
a legacy `model.pth` that pickles its `XttsConfig` object (coqui rewrites such a file in place on load) fails: load it once somewhere writable first.

`/health` `weights.files` lists the sha256 of `config.json`, `model.pth`, `vocab.json` and `speakers_xtts.pth` (when
present) as the load read them. The stock model is hashed the same way on its first load (about 1.8 GB, a few
seconds once per process). `weights.fingerprint` combines those hashes; `/synthesise` (`checkpoint`, `weights_fingerprint`) and `/synthesise/stream` (`X-Echo-Checkpoint`, `X-Echo-Weights`) report it per utterance, which is what to pin. See [api.md#weights-fingerprint](api.md#weights-fingerprint).
