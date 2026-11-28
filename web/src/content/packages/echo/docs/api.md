# The echo contracts

Echo has one contract per capability: **text to speech** (`tts`, below) and **speech to text** (`stt`,
[at the end](#speech-to-text)). Every engine of a capability is its own HTTP server with the same routes and
request fields, so a client can switch engines by changing a URL. The Python statement is
[src/argus_echo/contract/](../src/argus_echo/contract/) (`tts.py`, `stt.py`), and `argus-echo check <url>` tests a
running engine against the capabilities its `/health` names.

Per-engine detail: [Miso](miso-api.md) (the most complete reference; most of it holds for every engine),
[XTTS-v2](xtts.md), [Qwen3-TTS](qwen.md).

## Text to speech

The `tts` contract, served by **Miso**, **XTTS-v2** and **Qwen3-TTS** (each advertises `capabilities: ["tts"]`).
Its Python statement is [src/argus_echo/contract/tts.py](../src/argus_echo/contract/tts.py).

### Routes

| Method | Path | Miso | XTTS-v2 | Qwen3-TTS |
| --- | --- | --- | --- | --- |
| POST | `/synthesise` | yes | yes | yes |
| POST | `/synthesise/stream` | yes | yes | yes, one sentence at a time |
| POST | `/clone-voice` | yes | yes | yes |
| POST | `/analyze-clips` | yes | yes | yes |
| GET | `/clones` | yes | yes | yes |
| GET | `/clones/{companion_id}/download` | yes | yes | yes |
| DELETE | `/clones/{companion_id}` | yes | yes | yes |
| POST | `/clones/import` | yes | yes | yes |
| GET | `/speakers` | yes | yes | yes |
| GET | `/health` | yes | yes | yes |
| POST | `/admin/{evict,unload,wake}` | yes | yes | yes |
| POST | `/admin/load` | no | yes | yes |
| GET | `/media/{key}` | local backend only | no | no |

Every engine listens on `8031` inside its container. [compose.yaml](../compose.yaml) publishes Miso on `8140`,
XTTS on `8141`, Qwen on `8142` and Whisper (speech to text) on `8144`.

### Synthesis

`POST /synthesise` and `POST /synthesise/stream` take the same JSON body:

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `text` | string | required | |
| `voice_clone_id` | string | `null` | A stored clone. Wins over `speaker` and, on Qwen, `voice_description`: a request with both is spoken by the clone on the `base` slot (`model: base`, `X-Echo-Model: base`) |
| `speaker` | string | `null` | A built-in speaker from `GET /speakers` |
| `language` | string | `"en"` | ISO code. Miso: English only; any other language is `422` (`en-US`, `en_GB` are accepted). XTTS: 17 languages. Qwen: 10 (`en`, `zh`, `ja`, `ko`, `de`, `fr`, `ru`, `pt`, `es`, `it`) |
| `voice_description` | string | `null` | Qwen only: describe the voice, and a built-in speaker (`speaker`, else `QWEN_DEFAULT_SPEAKER`, else the first listed) is steered by it as an instruction. Needs the 1.7b CustomVoice model: on 0.6b it is `422`, since that model ignores instructions. Ignored elsewhere |
| `instruction` | string | `null` | Qwen only: delivery instruction for a built-in speaker. Applied by the 1.7b model only; the 0.6b one ignores it. Ignored elsewhere |
| `emotion` | string | `"neutral"` | Qwen only: a preset `instruction`, with the same 1.7b-only limit. Ignored elsewhere |
| `speed` | number | `null` | XTTS only: speaking-rate multiplier passed to inference (`1.0` when unset or not positive). Miso and Qwen accept it and ignore it |
| `device` | `"cpu"` | `null` | XTTS only: run without promoting the model to the GPU (a client sends it when argus-iris refuses its GPU lease); any other value is `422`. A model already on the GPU runs there. Miso and Qwen accept it and ignore it. See [xtts.md](xtts.md#gpu-memory-and-cpu-fallback) |
| `seed` | integer | `null` | Every engine: seeds python's, numpy's and torch's (CPU and every CUDA device) RNGs for this request, `0` to `4294967295` (anything else is `422`). What it makes reproducible differs by engine and route: see [Reproducibility](#reproducibility) |
| `temperature`, `topk`, `context` | | | Miso only; see [miso-api.md](miso-api.md) |

An engine ignores fields it has no use for instead of refusing them, so one request body works on all three. The
exception is a `language` the engine cannot speak: Miso refuses it rather than mispronounce it.

`/synthesise` stores a WAV and returns `{"audio_url", "duration", "duration_seconds", "format", "seed"}` (`seed`
echoes the request's, or `null`). XTTS adds `device`: where it ran (`cpu` or its `XTTS_DEVICE`). XTTS and Qwen add
the weights that generated this utterance: `checkpoint` (the name loaded with `/admin/load`, or `null` for stock)
and `weights_fingerprint` (see [Weights fingerprint](#weights-fingerprint)). Qwen also adds `model`, the slot that
spoke it: `base` for a `voice_clone_id`, `custom_voice` for a built-in `speaker` and a `voice_description`; its
`checkpoint` and `weights_fingerprint` are that slot's. Miso reports none of these.

`/synthesise/stream` answers `200` with `Content-Type: application/octet-stream` and the PCM layout in headers:

| Header | Value on every engine today |
| --- | --- |
| `X-Sample-Rate` | `24000` |
| `X-Audio-Format` | `pcm_f32le` (little-endian float32 in [-1, 1]) |
| `X-Channels` | `1` |

XTTS also sends `X-XTTS-Device`: where the stream runs (`cpu` or its `XTTS_DEVICE`). XTTS and Qwen send the
weights generating the stream, with the other headers, before the first byte:

| Header | Engines | Value |
| --- | --- | --- |
| `X-Echo-Checkpoint` | XTTS, Qwen | The checkpoint name, percent-encoded (`forge/run%207`); empty for stock weights |
| `X-Echo-Weights` | XTTS, Qwen | The [weights fingerprint](#weights-fingerprint) |
| `X-Echo-Model` | Qwen | `base` or `custom_voice`, as `model` above |

These (and the `/synthesise` fields) are read under the request's model lease, which it holds until the last
byte. `/admin/load` answers `409` while any lease is held, so the weights can't change between the header and the
end of the utterance. **Pin the fingerprint from each response, not from `/health`**: the engine is shared, and
another client can load other weights between your `/health` read and your request (or swap A, B and back to A).
`/health`'s `weights.files` is also `null` until the first load, and both engines load lazily.

Read the format from the headers rather than assuming it. Errors found before audio starts (validation, model
loading, out of memory, busy) are normal JSON errors; once the `200` is sent, a failure can only end the stream
early. How soon audio starts differs: Miso and XTTS stream within a sentence, while Qwen splits the text into
sentences and sends each one as soon as it is rendered (the first byte comes after the first sentence). Qwen
renders that first sentence before answering `200`, so an error in it is still a JSON error. When the client
disconnects, XTTS stops at the next chunk and Qwen starts no further sentence (the one in progress finishes).

Busy, loading and out-of-memory answers are `503`, with `Retry-After` where the engine knows a good wait. XTTS
answers a model it cannot move onto the GPU with `503`, the reason in `error` and `Retry-After:
$XTTS_OOM_RETRY_AFTER_S`, unless `XTTS_CPU_FALLBACK` (the default) runs the request on the CPU instead. For that
long after a promotion runs out of memory XTTS doesn't try another: requests run on the CPU (or get the `503`)
without moving the weights. `POST /admin/wake` still tries at once.

### Reproducibility

`seed` is applied at the start of each generation, in the thread that generates: python's `random`, numpy's global
RNG and `torch.manual_seed` (the CPU generator and every CUDA device's). Every engine samples from torch's
process-wide RNG, so no other generation may draw from it in between. Miso generates one request at a time anyway
(its GPU lock). XTTS and Qwen let unseeded requests generate side by side, as before; a seeded generation waits
for those, runs alone, and holds new ones back until it ends. A seeded XTTS stream therefore blocks every other
XTTS generation for as long as it runs. Generations wait on their own threads (`XTTS_GENERATION_THREADS`,
`TTS_GENERATION_THREADS`, default 8), never in the pool the engine's other work shares, and a wait longer than
`XTTS_RNG_WAIT_S` / `TTS_RNG_WAIT_S` (default 60 s; `0` waits for ever) is a `503` with `Retry-After: 5`. A
seeded XTTS stream waits before its `200`, so that `503` comes instead of an empty stream, and one whose client
takes nothing for `XTTS_RNG_WAIT_S` ends early, so a stalled client can't hold the others back for longer.

Same seed means same audio only when everything else is the same too:

- the text, `language`, voice (`voice_clone_id` or `speaker`; Qwen's `voice_description`, `instruction`,
  `emotion`; Miso's `temperature`, `topk`, `context`) and XTTS's `speed`;
- the weights: compare `/health` `weights` (file hashes), since `/admin/load` can change them;
- the engine's sampling settings (`XTTS_TEMPERATURE`, `XTTS_STREAM_CHUNK_SIZE`, `TTS_MAX_NEW_TOKENS`, ...);
- the device: a CPU run and a GPU run draw different random numbers and compute in different precision. **XTTS can
  run a request on the CPU** (`device: "cpu"`, or the CPU fallback when the GPU has no room), so check `device` in
  the response (`X-XTTS-Device` on a stream) and compare only runs on the same one. Qwen and Miso always generate
  on their configured device;
- the image and the GPU model: compare `/health` `image`, both its release and its `runtime` (torch, CUDA, cuDNN
  and the engine library versions), not the revision alone. From 0.3.0 the XTTS, Qwen and Miso images pin every
  package to an exact version (`engines/<engine>/constraints.txt`; Miso's `uv.lock` plus `server-constraints.txt`),
  so one revision builds one stack; `runtime` still says what is actually running. The driver version isn't
  there; take it from the host.

**Measured.** On 2026-11-22 each case below ran twice with seed 42 and once with seed 43, and the outputs were
compared byte for byte (SHA-256 of the WAV `/synthesise` stores, or of the PCM `/synthesise/stream` sends). Every
seed-42 pair was **identical**, and every seed-43 run **differed**:

| | XTTS-v2 | Qwen3-TTS |
| --- | --- | --- |
| Server code | this repo at `b3d78d8` | this repo at `b3d78d8` |
| Runtime | image `argus-echo-xtts:0.1.0` (revision `d7092cd`; torch 2.6.0+cu124, coqui-tts 0.28.0) with that `xtts_server.py` mounted over it | torch 2.6.0+cu124, qwen-tts 0.1.1, transformers 4.57.3 (not an image: the qwen image installs unpinned versions) |
| Model | stock XTTS-v2, `cuda:0` (`device: "cuda:0"` on every run) | stock 0.6B Base and CustomVoice, `cuda:0` |
| Built-in voice | studio speaker `Aaron Dreschner` | speaker `aiden` (CustomVoice) |
| Clone | `/clone-voice` from the bundled public-domain clip (`src/argus_echo/assets/jfk.flac`, 24 kHz) | the same clip (Base) |
| Routes, each voice | `/synthesise` (one sentence), `/synthesise/stream` (two sentences) | the same |

The GPU was an RTX 3090 (driver 580.178.04). Not measured: Miso, Qwen 1.7B, a fine-tuned checkpoint, XTTS's CPU
path, other GPU models or torch versions, and the published 0.1.1+ images. Treat those as the "expected" rows
below until someone hashes two runs.

With everything above fixed, the table says what to expect for each engine; the measured cases are marked.

| Engine | `/synthesise`, same seed twice | `/synthesise/stream`, same seed twice | Stream vs `/synthesise` |
| --- | --- | --- | --- |
| Miso | Expected identical | Expected identical | Different audio: the stream decodes incrementally and is not watermarked; `/synthesise` decodes once and watermarks |
| XTTS-v2 | **Measured identical** (built-in speaker and clone, setup above); expected elsewhere (one seed; the text's sentences sample in order) | **Measured identical** (built-in speaker and clone, setup above); expected elsewhere if `XTTS_STREAM_CHUNK_SIZE` is the same: tokens sample in the same order, under one seed, for the whole stream | Different audio: `inference_stream` decodes chunk by chunk with a cross-fade and takes latents from the sampler, while `inference` runs a second GPT pass and decodes once |
| Qwen3-TTS | **Measured identical** (0.6B, built-in speaker and clone, setup above); expected elsewhere (one seed, one generation over the whole text) | **Measured identical** (0.6B, built-in speaker and clone, setup above); expected elsewhere: sentence *i* (from 0) is generated alone with seed + *i* | Different audio for more than one sentence (each sentence is generated alone); the first sentence equals `/synthesise` of that sentence alone with the same seed |

**Why "expected", not "guaranteed".** The engines run without `torch.use_deterministic_algorithms(True)` (some
kernels have no deterministic version, and the rest cost speed), and PyTorch only promises run-to-run identical
results on CUDA under that setting. In practice the forward-pass kernels these models use (cuBLAS matmuls, SDPA
attention, cuDNN convolutions with `cudnn.benchmark` off) give the same bits on the same GPU for the same shapes,
but nothing enforces it, and one flipped bit in a logit can change a sampled token, after which the rest of the
audio differs completely, not slightly. A stream the client abandons ends early: what it sent matches the start of
a full one.

### Voices

To clone a voice, use XTTS-v2: it is the suite's cloning engine (argus-echo#51; see
[voice-cloning.md](voice-cloning.md)). Its weights are non-commercial (Coqui Public Model Licence).

Built-in speakers (`GET /speakers` → `{"speakers": [{"id", "name", "language", "languages"}]}`):

- **Miso** has no real built-in voices: `0` and `1` are conversation turns, and without a clone the voice is
  different every time (unless the request sends a `seed`). Clone a voice for anything you keep.
- **XTTS-v2** has 58 studio speakers (`Claribel Dervla`, …), each able to speak any of its 17 languages.
- **Qwen3-TTS** has the CustomVoice model's speakers, which the 1.7b model steers by an `instruction` or a
  `voice_description`.

On XTTS and Qwen, `GET /speakers` loads the model if it is not loaded.

`POST /clone-voice` is `multipart/form-data` with one or more `audio` files, `reference_text` (the transcript;
Miso needs it) and `companion_id` (`^[A-Za-z0-9_-]{1,64}$`). Miso fills an empty `reference_text` from the
speech-to-text engine when `MISO_STT_URL` names one (see [miso-api.md](miso-api.md#post-clone-voice)). A clone is stored at
`voice_clones/<companion_id>/prompt.pt` with a `meta.json`. To speak with it, send the `voice_clone_id` that
`/clone-voice` (and `/clones/import`, and each entry of `GET /clones`) returns: that full key,
`voice_clones/<companion_id>/prompt.pt`, not the bare `companion_id`, which is `422 Voice clone not found`. The
clone-management routes (`/clones/{companion_id}/download`, `DELETE /clones/{companion_id}`) take the bare id.
**Clones are engine-specific**: each engine's `prompt.pt` is its own format, which is why each engine gets its
own bucket. Every engine's download archive holds `prompt.safetensors` + `meta.json`, with the engine's own
tensors inside, and its import refuses an archive with only a pickled `prompt.pt` (a download from an older
version; re-export it from a current engine), because unpickling an upload can run code. `POST /clones/import`
answers `409` when the target id already has a clone, unless the form field `replace=true` is sent, and `422` for
an archive that is not this engine's format. Qwen checks both the archive's `meta.json` `engine` and the prompt
itself; see [qwen.md](qwen.md#clones). See
[voice-cloning.md](voice-cloning.md) for what makes a good reference.

## Health and lifecycle

`GET /health` is argus-cortex's `ResidentHealth`, which argus-iris reads: top-level `model_state` (`unloaded`,
`loading`, `cpu`, `gpu`, `error`), `busy`, `idle_s`, and a `gpu` memory block, plus `engine`, `model`,
`device` and `capabilities`. `engine` is exactly one of `miso`, `xtts-v2`, `qwen-tts` or `whisper`, and clients
may key on it. `capabilities` lists the contracts the engine serves (`["tts"]` or `["stt"]`; `argus-echo check`
runs only those suites, and treats an engine that names none as `tts`).

The same `200` body is argus-cortex's `ServiceHealth`, the shape every Argus service answers `/health` with:

| Field | Value |
| --- | --- |
| `service_version` | The health contract's version (`1.1`) |
| `service` | `argus-echo`, on every engine; `engine` says which one |
| `version` | The echo release the image was built from (`image.version`), or `0.0.0+unknown` for a local build |
| `build` | The git commit (`image.revision`), or `null` |
| `status` | `ok`, or `degraded` when a required check failed. Both are `200` |
| `checks` | `{"model": {"ok", "detail", "latency_ms", "required"}}`: `ok` is false while `model_state` is `error` (the last load failed; the next request tries again) |
| `started_at` | When the process started (UTC) |
| `peer` | The container's `argus.peer` label (`miso`, `xtts`, `tts` for Qwen, `whisper`), which compose passes as `ARGUS_PEER`; `null` when it was not told |
| `capabilities` | As above |
| `wire`, `read_only` | `{}` and `false`: echo's contracts carry no version number, and no engine has a read-only mode |

`GET /health?checks=0` skips the check. The route is not listed in the engine's `/openapi.json`.

It answers `503 {"status": "loading"}` while a model loads. XTTS also answers `503` with
`"status": "gpu_error"` after a CUDA error that is not an out-of-memory: such an error breaks the process's GPU
context, so the worker needs a restart. (An out-of-memory is a `503 GPU OOM` on the request and can be retried.)
Miso answers `503` with `"status": "stuck"` ([miso-api.md](miso-api.md#get-health)). These `503` bodies are the
engines' own, not `ServiceHealth` (whose `status` is only `ok`, `degraded` or `starting`): the ones with fields
keep every field above except the `ServiceHealth` ones.

Two blocks identify what is running, so a client (argus-proof's run manifest) can pin it:

- `image` (every engine): `{"version", "revision", "runtime"}`. `version` and `revision` are the release (`0.2.0`)
  and git commit the image was built from, baked in as build args (`ECHO_VERSION`, `ECHO_REVISION`) by the release
  workflow; both are `null` for an image built without them (a local `docker compose build`). `runtime` names the
  library versions that shape the output, read once from the running process: `python`, and on the torch engines
  `torch`, `cuda` and `cudnn` (torch's own build), then each engine's libraries: `coqui-tts`, `transformers`,
  `torchaudio`, `numpy` (XTTS); `qwen-tts`, `transformers`, `accelerate`, `torchaudio`, `numpy` (Qwen); `moshi`,
  `transformers`, `torchaudio`, `numpy` (Miso); `faster-whisper`, `ctranslate2`, `nvidia-cublas-cu12`,
  `nvidia-cudnn-cu12`, `numpy` (Whisper). A library that isn't installed is `null`. Two builds of one revision can
  install different versions, which is why `runtime` is there. The image **digest** is not there: it only exists
  once the image is built, and a running container cannot read it (nor the OCI labels the release sets). Take it
  from whoever deployed the container (`docker inspect`, compose, iris), or record the tag.
- `weights` (XTTS, Qwen): `{"checkpoint", "fingerprint", "files"}`, plus `models` on Qwen. `checkpoint` is the
  name loaded with `POST /admin/load`, or `null` for the stock weights. `files` lists `{"name", "sha256", "bytes"}`
  for every file the last load of those weights read: hashed once, in the load's worker thread, never per request
  (an unchanged file is not even re-read on a later reload). Stock weights are hashed too, so either can be pinned.
  `fingerprint` is the [weights fingerprint](#weights-fingerprint) of all of `files`, computed with them. Qwen
  prefixes each name with its model slot (`base/model.safetensors`,
  `custom_voice/speech_tokenizer/model.safetensors`, ...) and adds `models`: per loaded slot,
  `{"checkpoint", "fingerprint"}`, where `checkpoint` is the name if that slot was loaded from the checkpoint (else
  `null`) and `fingerprint` covers only that slot's files. That per-slot fingerprint is the one a Qwen response
  reports. `files`, `fingerprint` and `models` are `null` until the selected weights have been loaded.

  When they change: only a load sets them. Evicting to the CPU and promoting back moves the same weights, so they
  stay as they were, with nothing hashed again. A full idle unload keeps the selection and its last hashes; the
  next request's lazy reload hashes the same files again (from a cache keyed by path, size and mtime, so unchanged
  files aren't read) and comes out with the same fingerprint, or a different one if a file changed on disk.
  `/admin/load` replaces them, and `/admin/unload` clears them (stock is selected; the next load hashes it). A
  failed load clears them, and so does a failed Qwen move between devices, which frees the models: nothing is
  loaded, so nothing is reported.

Each engine loads its model on first use and leaves the GPU after an idle period (`MISO_KEEP_ALIVE_GPU`,
`XTTS_KEEP_ALIVE_GPU`, `TTS_KEEP_ALIVE_GPU`). The admin routes move it on demand:

| Route | Effect |
| --- | --- |
| `POST /admin/evict` | GPU to CPU RAM (stays warm) |
| `POST /admin/unload` | Free GPU and RAM. On XTTS and Qwen it also drops a loaded checkpoint: the next load is stock |
| `POST /admin/wake` | Load onto the GPU now |
| `POST /admin/load` | XTTS and Qwen: replace the loaded weights with a fine-tuned checkpoint (below) |

**What stays on the GPU.** Evicting or unloading moves every weight off the GPU and returns torch's allocator cache
to the driver, so `gpu.reserved_mb` falls to about 0. What remains is the process's CUDA context, a few hundred MB
(about 320 MB on an RTX 3090 for XTTS or Qwen) that torch can neither see nor free: only ending the process returns
it. `gpu.cuda_context` (XTTS, Qwen) says whether the process holds one. iris measures what each process holds on its
own, and its `restart_residual_mb` rule restarts a resident that is unloaded but still holds that much.

### Weights fingerprint

One sha256 that names a set of weight files, so a response can say which weights produced it. Recompute it from
`/health`'s `weights.files` (or with `argus_echo.contract.weights_fingerprint`):

1. Take the files: all of `weights.files` for XTTS's fingerprint and for Qwen's top-level `weights.fingerprint`;
   for a Qwen slot (`weights.models.<slot>.fingerprint`, and what a Qwen response reports), only the files whose
   `name` starts with `<slot>/` (`base/` or `custom_voice/`).
2. Make one line per file: `<name>:<sha256>`, with `name` exactly as listed, **the slot prefix kept** on Qwen, and
   `sha256` as listed (lowercase hex). Each line ends with a line feed (`\n`, 0x0A), the last one included.
3. Encode each line as UTF-8 and sort the lines byte-wise (on the whole line, not just the name).
4. Concatenate them, take the sha256 of those bytes, and write it as 64 lowercase hex digits.

XTTS uses the same recipe; its names have no prefix. Worked example (the sha256 values are those of the strings
`weights`, `config` and `base`), Qwen with three files:

| `name` | `sha256` |
| --- | --- |
| `custom_voice/model.safetensors` | `9a129038d9a00aed0cf6a7ea059ca50a813449061ab87848cf1a13eafdf33b2c` |
| `custom_voice/config.json` | `b79606fb3afea5bd1609ed40b622142f1c98125abcfe89a76a661b0e8e343910` |
| `base/model.safetensors` | `cae662172fd450bb0cd710a769079c05bfc5d8e35efa6576edc7d0377afdd4a2` |

The `custom_voice` fingerprint hashes these 2 lines (in this order, each ending in `\n`):

```
custom_voice/config.json:b79606fb3afea5bd1609ed40b622142f1c98125abcfe89a76a661b0e8e343910
custom_voice/model.safetensors:9a129038d9a00aed0cf6a7ea059ca50a813449061ab87848cf1a13eafdf33b2c
```

and is `b955ea711653a31092cf4acad596e71ac31cb8f85c6feabe209f32ada86fecfb`. The `base` fingerprint (one line) is
`8763f2a5235402fc83d026fd46b563e7fa6c7b0c9d12a3cad770d4856148eebc`, and all three files together (the top-level
`weights.fingerprint`) give `e205d97735019470b091f339590c5f050f068b0f7817439400ed4337db73c89c`. For XTTS, the files
`config.json` with sha256 `b79606fb3afea5bd1609ed40b622142f1c98125abcfe89a76a661b0e8e343910` and `model.pth` with
`9a129038d9a00aed0cf6a7ea059ca50a813449061ab87848cf1a13eafdf33b2c` (the hashes above of `custom_voice/config.json`
and `custom_voice/model.safetensors`) give `311b8ed7abed4ae45274fedccda241ff6d0a129db13ea34b25b9fe0431de2649`. The engines' tests and the package's assert
these digests with the code's own function, so these docs and the code can't drift apart unnoticed.

### Fine-tuned checkpoints

`POST /admin/load {"checkpoint": "<name>"}` (XTTS and Qwen; Miso has no such route) loads a fine-tuned checkpoint
in place of the stock weights, so iris or argus-proof can swap checkpoints between runs without restarting the
container. It needs the admin bearer like every `/admin/*` route. `<name>` is a directory under the engine's
checkpoint root (`XTTS_CHECKPOINT_ROOT`; `TTS_CHECKPOINT_ROOT` for Qwen, which compose mounts read-only from
`QWEN_CHECKPOINT_ROOT`), and may be nested (`forge/run-7`). `{"checkpoint": null}` loads the stock weights.

The name is resolved with argus-cortex's `safe_join`, and the directory is checked before anything is unloaded:

| Status | When |
| --- | --- |
| `200` | Loaded: `{"status": "loaded", "model_state", "weights", "gpu"}` (Qwen adds `slot`) |
| `400` | The name escapes the root (`..`, an absolute path, a symlink out of it, a file in it that links out) |
| `404` | No such directory |
| `409` | Busy: a request holds the model. Nothing changes; retry when `/health` says `busy: false` |
| `422` | Not a checkpoint this engine loads (what each needs: [xtts.md](xtts.md#fine-tuned-checkpoints), [qwen.md](qwen.md#fine-tuned-checkpoints)), or no `checkpoint` key |
| `500` | The load itself failed. Nothing is loaded, `model_state` is `error` and the stock weights are selected, so the next request loads stock |
| `503` | No checkpoint root is configured, or the admin token is unset |

A load waits for a load or move already in progress, frees the old weights, and loads the new ones as a task that
a disconnecting client cannot cancel half-way. Synthesis that arrives meanwhile gets `503 Model(s) still loading`.
XTTS loads onto the CPU (the next request promotes it, as after any load); Qwen loads straight onto `TTS_DEVICE`.

The checkpoint stays selected until the next `/admin/load` or `/admin/unload`: the idle eviction and unload keep
it, so the next request reloads the same weights. If that reload fails (the directory was removed or a file in it
is unreadable), the request that triggered it fails, the checkpoint is dropped and stock is selected, as after a
failed `/admin/load`: the next request loads stock, and responses and `/health` say `checkpoint: null`.
`/admin/unload` (iris sends it too, to free memory) returns to stock. Clones are conditioning computed by whichever
weights were loaded when they were made; a clone made on the stock weights still works with a checkpoint, but to
compare checkpoints fairly clone the reference under each.

## Security

- `/admin/*` needs `Authorization: Bearer <ARGUS_ADMIN_TOKEN>` (argus-cortex's `bearer`). With the token unset
  the routes answer `503`; `ARGUS_ADMIN_INSECURE=1` opens them for local development only.
- **No other route is authenticated.** Anyone who can reach an engine can synthesise, and can create, replace,
  download and delete clones. The engines have no idea who is calling, so nothing stops one caller from using or
  deleting another's clone. Keep the ports on loopback or a trusted network (`ECHO_BIND`), or put a gateway in
  front that authenticates callers and owns the `companion_id` namespace.
- A clone of a real person's voice needs their consent. argus-mask's Voices page records it
  (`argus_cortex.consent`); calling `/clone-voice` directly records nothing.

## Speech to text

The `stt` contract, served by the **whisper** engine (published on `8144`). Its Python statement is
[src/argus_echo/contract/stt.py](../src/argus_echo/contract/stt.py). An engine names what it serves in
`GET /health` as `capabilities` (`["stt"]` here); an engine that names nothing is a TTS engine, and
`argus-echo check` runs only the matching checks. Model choice and settings: [whisper.md](whisper.md). A Wyoming
client (Home Assistant) reaches it through the `wyoming-whisper` bridge, which posts each utterance to
`/transcribe` ([voice-cloning.md#home-assistant](voice-cloning.md#home-assistant)).

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/transcribe` | One clip in, one transcript out |
| POST | `/transcriptions` | agent-composer's JSON route: a URL or base64 clip in, composer's transcript shape out |
| WS | `/transcribe/stream` | Live PCM in, partial and final transcripts out |
| GET | `/health` | `ResidentHealth` and `ServiceHealth`, plus `engine`, `model`, `revision` (the model's), `device`, `streams` |
| POST | `/admin/{evict,unload,wake}` | As above; evict moves the weights to host RAM |

### `POST /transcribe`

`multipart/form-data`:

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `audio` | file | required | WAV or FLAC (sniffed from the magic bytes), 1 or 2 channels (averaged), 8 to 96 kHz; or any other audio ffmpeg can demux with a format in `STT_INPUT_FORMATS` (a browser's webm/opus recording, mp3, ogg, m4a, ...), resampled to 16 kHz mono |
| `language` | string | detected | ISO 639-1 (`en`). A region suffix is dropped (`en-US` → `en`). An unknown code is `422`. Also accepted as a query parameter (`?language=en`, as agent-composer's sidecar took it); the form field wins |
| `word_timestamps` | bool | `false` | Adds `words` to every segment |

The upload is read through argus-cortex's `read_upload`, so the byte cap (`STT_MAX_UPLOAD_MB`, default 50) holds
first. WAV and FLAC then go through `open_audio`, which checks channels, rate and duration (`STT_MAX_SECONDS`,
default 600) before a sample is decoded. Other formats go through ffmpeg exactly as on `/transcriptions` (below):
it reads only the audio (a pipe, or a private temp file for MP4/M4A), may use only a demuxer in `STT_INPUT_FORMATS`
(`none`: WAV/FLAC only), and stops past `STT_MAX_SECONDS` (`413`). Undecodable audio is `400`. At most
`STT_MAX_DECODES` requests (default 2, shared with `/transcriptions`) decode at once; the rest wait up to
`STT_QUEUE_TIMEOUT_S`, then get `503`. Nothing is stored.

```json
{
  "text": "And so, my fellow Americans, ask not what your country can do for you, ask what you can do for your country.",
  "language": "en",
  "language_probability": 0.96,
  "duration": 11.0,
  "segments": [
    {"start": 0.0, "end": 10.38, "text": "And so, my fellow Americans, ...",
     "words": [{"start": 0.0, "end": 0.24, "word": " And", "probability": 0.9}]}
  ]
}
```

`language_probability` is null when the language was given. `words` is present only with `word_timestamps`. `text`
is empty for silence. Times are seconds from the start of the clip.

| Status | When |
| --- | --- |
| `400` | Not WAV or FLAC, unreadable, too many channels, a rate outside the list |
| `413` | Over the byte cap or the duration cap |
| `422` | Unknown `language` |
| `503` | Loading, out of GPU memory, or every transcription or decode slot busy for `STT_QUEUE_TIMEOUT_S` (default 30); with `Retry-After` |

Transcriptions run one at a time (`STT_CONCURRENCY`); later requests queue for up to `STT_QUEUE_TIMEOUT_S`.
Whisper writes numbers as digits (`7.30`, `12%`): normalise both sides before scoring a transcript against a script.

### `POST /transcriptions`

Transcription from a URL or base64, imported from agent-composer's whisper sidecar as `voice-stack/` retires
(smk762/agent-composer#81). For a clip the caller already holds, `/transcribe` (multipart) is simpler. JSON body
(unknown fields are ignored, nulls are fine):

| Field | Type | Notes |
| --- | --- | --- |
| `audio_url` | string | An `http`/`https` URL the engine downloads (rules below) |
| `audio_base64` | string | The audio as standard base64; a `data:...;base64,` prefix is accepted |
| `language` | string | As on `/transcribe`: ISO 639-1, a region suffix dropped, detected when absent; unknown is `422` |

Exactly one of `audio_url` and `audio_base64`: both is `422`, neither `400`.

```json
{"text": "And so, my fellow Americans, ...", "language": "en", "duration_seconds": 11.0, "confidence": 0.96}
```

`confidence` is Whisper's language-detection probability (`1.0` when `language` was given), as composer reported it;
it says nothing about the transcript. No segments or word times: use `/transcribe` for those.

The audio gets the same caps as a `/transcribe` upload before anything is decoded: the request body is capped at the
base64 size of `STT_MAX_UPLOAD_MB`, the base64 length is checked before decoding, and the decoded bytes, the
download, the format and the duration (`STT_MAX_SECONDS`) are checked as on `/transcribe`. At most
`STT_MAX_DECODES` requests (default 2) fetch and decode at once; the rest wait up to `STT_QUEUE_TIMEOUT_S`, then get
`503`. WAV and FLAC go through argus-cortex's `open_audio`; one it refuses (a sample rate outside the ones it
takes, such as 12 kHz) goes to ffmpeg as well, unless `STT_INPUT_FORMATS=none`. Anything else is decoded by the
ffmpeg CLI (in the image): the bytes go in on a pipe, and `-protocol_whitelist pipe` stops anything inside them (a
playlist, a reference) from opening a file or the network. MP4/M4A/MOV is the exception, because its index often
comes after the audio (ffmpeg's and most recorders' default without faststart) and the demuxer must seek back to it,
which a pipe can't do: those bytes are written to a private temporary file (0600, in a 0700 directory, deleted
afterwards) that ffmpeg opens with `-protocol_whitelist file` and `-enable_drefs 0`, so an MP4's external data
references are never followed. `-format_whitelist` allows only the demuxers in `STT_INPUT_FORMATS` (plain audio
containers by default: WAV, MP3, Ogg/Opus, FLAC, WebM/Matroska, MP4/M4A, AAC, AIFF, CAF, AMR, AU; no playlists),
and output stops just past `STT_MAX_SECONDS`. `STT_INPUT_FORMATS=none` accepts WAV and FLAC only.

Unlike `/transcribe`, it runs faster-whisper's Silero VAD filter, which drops silence before Whisper runs
(`STT_VAD_FILTER`, default `1`), as composer's sidecar did: Whisper is prone to inventing text for silence, and
audio fetched from a URL is often unedited.
`/transcribe` keeps it off so its segment times cover the whole clip; set `STT_VAD_FILTER=0` for the same here.

`audio_url` is fetched with argus-cortex's `afetch`:

- `http` and `https` only, and no `user:password@`.
- Every address the host resolves to must be public: loopback, private, link-local (cloud metadata), CGNAT,
  multicast, reserved and unspecified addresses are refused, IPv4 inside IPv6 included, unless the host (`host` or
  `host:port`) is in `STT_AUDIO_URL_ALLOWED_HOSTS` (e.g. `minio:9000`).
- The connection is pinned to the address that was checked (`Host` and TLS SNI keep the name), so a DNS rebind
  between the check and the connect can't move it.
- Redirects are not followed (`STT_AUDIO_URL_MAX_REDIRECTS`, default `0`); when they are, every hop is checked again.
- The body is capped at `STT_MAX_UPLOAD_MB` as it streams (a larger `Content-Length` is refused before reading), and
  the whole fetch at `STT_DOWNLOAD_TIMEOUT` seconds (default 30). Environment proxies are ignored.

A refused URL answers `{"error": "audio_url is not an allowed http(s) URL"}` (`400`) and a failed download (refused
connection, timeout, redirect, a non-200 answer) `{"error": "Could not download audio_url"}` (`502`), whatever the
reason; the reason is logged, never the resolved address.

| Status | When |
| --- | --- |
| `400` | Neither field, bad base64, a refused `audio_url`, audio ffmpeg (or, for WAV/FLAC, `open_audio`) can't read |
| `413` | Body, download, decoded bytes or duration over its cap |
| `422` | Both fields, a body that isn't the JSON object above, or an unknown `language` |
| `502` | `audio_url` could not be downloaded |
| `503` | As `/transcribe`, with `Retry-After` |

Errors are `{"error": "..."}` as on every echo route; composer's were FastAPI's `{"detail": "..."}`.

### `WS /transcribe/stream`

For live speech. The server cuts the stream into utterances with voice activity detection (Silero VAD, the
model faster-whisper ships, on the CPU) and transcribes each one.

1. The server sends `{"type": "ready", "sample_rate": 16000, "audio_format": "pcm_s16le", "channels": 1,
   "min_silence_ms": 600, "max_utterance_s": 30}`.
2. The client may send `{"type": "start", "language": "en", "word_timestamps": false}` before any audio.
3. The client sends audio as binary frames: 16 kHz mono little-endian int16, at most 1 MiB a frame, split
   anywhere (an odd byte is carried to the next frame).
4. While an utterance is open the server sends `{"type": "partial", "start", "text"}` every
   `STT_STREAM_PARTIAL_S` (default 1.0) seconds of speech; each replaces the last.
5. After `STT_STREAM_MIN_SILENCE_MS` of silence (default 600), or `STT_STREAM_MAX_UTTERANCE_S` of speech (default
   30), it sends `{"type": "final", "start", "end", ...}` with the `POST /transcribe` fields. Every time is seconds
   from the start of the stream; an utterance starts 200 ms before the detected onset, and `end` includes the
   silence that closed it.
6. `{"type": "end"}` flushes the open utterance (its final) and closes the socket.

A bad control message, a bad `language` or an oversized frame gets `{"type": "error", "error"}` and a close.
At most `STT_STREAM_MAX_SESSIONS` (default 4) streams are open at once; the next gets an error and close code
`1013`. The model lease is held per transcription, not per stream, so an idle stream does not keep the model on
the GPU. Silence alone loads nothing.

`/transcribe`, `/transcriptions` and `/transcribe/stream` are unauthenticated, like the TTS routes: keep the port on
a trusted network. `/transcriptions` makes the engine fetch URLs: its SSRF policy keeps it off private addresses,
but anyone who can reach the port can make it download from the internet.
