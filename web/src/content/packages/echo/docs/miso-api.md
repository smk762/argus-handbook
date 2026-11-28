# Miso engine: HTTP API

Source: [engines/miso/miso_server.py](../engines/miso/miso_server.py). Published on
port 8140 by `compose.yaml` (`MISO_PORT`). The shared contract and how the engines
differ are in [api.md](api.md); this page is Miso's detail. The contract started
as XTTS-v2's, so field names
such as `voice_clone_id`, `companion_id` and `gpt_cond_len` come from XTTS.

Errors are JSON: `{"error": "<message>", ...}`. A body that fails schema
validation (missing `text`, wrong types) gets FastAPI's standard 422
`{"detail": [...]}` instead.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | [`/synthesise`](#post-synthesise) | Text to a stored WAV; returns its URL |
| POST | [`/synthesise/stream`](#post-synthesisestream) | Text to raw PCM, streamed as it is generated |
| POST | [`/analyze-clips`](#post-analyze-clips) | Score candidate reference clips (no clone made) |
| POST | [`/clone-voice`](#post-clone-voice) | Build and store a one-shot voice clone |
| GET | [`/clones`](#get-clones) | List stored clones |
| GET | [`/clones/{companion_id}/download`](#get-clonescompanion_iddownload) | Clone as a zip |
| DELETE | [`/clones/{companion_id}`](#delete-clonescompanion_id) | Delete a clone |
| POST | [`/clones/import`](#post-clonesimport) | Import a downloaded clone zip |
| GET | [`/speakers`](#get-speakers) | Built-in integer speakers |
| GET | [`/health`](#get-health) | Readiness, model state, GPU lock, memory |
| GET | [`/media/{key}`](#get-mediakey) | Serve stored files (local backend only) |
| POST | [`/admin/evict`, `/admin/unload`, `/admin/wake`](#admin) | Move the model between states |

## Status codes shared by the synthesis routes

These apply to `/synthesise` and `/synthesise/stream`. `/admin/wake` can also return the load errors. `/clone-voice` does not load the model; it only returns `503 Model still loading` while another request is loading it:

| Status | Body `error` | Meaning | Retry? |
| --- | --- | --- | --- |
| 422 | `text is required` | Empty or whitespace `text` | No |
| 422 | `Miso supports English only (language 'en'); got '…'` | `language` is not `en` or a region of it (`en-US`, `en_GB`). Body adds `supported_languages: ["en"]`. Checked before the model loads | No |
| 422 | various | Bad `voice_clone_id` (`Voice clone not found: …`), non-integer `speaker`, bad `context`, or reference + text too long for the prompt. (A non-finite `temperature` fails schema validation instead: FastAPI's `{"detail": [...]}` 422) | No |
| 503 | `Model still loading` | Another request is loading the model | Yes |
| 503 | `Model load failed: …` | Loading failed (non-OOM). `/health` shows `model_state: "error"` | After fixing the cause |
| 503 | `GPU OOM while loading the model` / `GPU OOM while generating` | CUDA out of memory. Body adds `detail` and `gpu`. Header `Retry-After: MISO_OOM_RETRY_AFTER_S` (30) | Yes, after `Retry-After` |
| 503 | `TTS busy: another generation holds the GPU` | Waited `MISO_LOCK_WAIT_S` (120 s) for the single GPU lock. Body `holder` = `{request_id, endpoint, busy_s}`. `Retry-After: 5` | Yes |
| 503 | `Model was unloaded while the request waited; retry` | An admin unload or demote happened mid-request. Body `model_state`. `Retry-After: 1` | Yes |
| 503 | `GPU error` | Non-OOM CUDA runtime error. Body adds `detail`, `gpu` | Usually not; check `/health` |
| 504 | `TTS generation timed out after N s` | `/synthesise` only: generation ran past `MISO_GEN_TIMEOUT_PAD_S + MISO_GEN_TIMEOUT_FACTOR × audio budget` | Maybe; the GPU lock stays held until the stuck generation returns |
| 500 | `TTS generation failed: …` / `TTS preparation failed: …` | Anything else | — |

Only one generation runs at a time. Requests queue on the GPU lock for up to
`MISO_LOCK_WAIT_S` seconds before they get the 503 busy answer.

## POST /synthesise

Generates the whole utterance, stores it as a WAV, and returns its URL.

Request (`application/json`):

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `text` | string | required | English only |
| `voice_clone_id` | string | `null` | A clone's `voice_clone_id` (`voice_clones/<id>/prompt.pt`) or bare `companion_id` |
| `speaker` | string | `null` | Integer speaker id as a string (`"0"`, `"1"`). Ignored when `voice_clone_id` is set. Default `MISO_DEFAULT_SPEAKER` |
| `temperature` | number | `null` | Clamped to 0.1–1.5. Order of precedence: request, then the clone's `meta.json`, then `MISO_TEMPERATURE` |
| `topk` | integer | `null` | Clamped to 1–200. Same precedence, falling back to `MISO_TOPK` |
| `context` | array | `null` | Previous utterances for continuity, oldest first. See [Context](#context) |
| `seed` | integer | `null` | `0` to `4294967295`. Seeds the sampler before generation (python, numpy, torch CPU and CUDA). Without a clone it also fixes the otherwise random voice. See [api.md](api.md#reproducibility) |
| `language` | string | `"en"` | `en`, or a region of it (`en-US`, `en_GB`). Anything else is `422`: Miso speaks English only |
| `voice_description`, `instruction`, `emotion`, `speed` | — | — | Accepted for XTTS compatibility and ignored |

Response `200`:

```json
{
  "audio_url": "http://host:8140/media/generated/voice/<uuid>.wav",
  "duration": 2.48,
  "duration_seconds": 2.48,
  "format": "wav",
  "seed": null
}
```

The audio is 24 kHz mono, faded in by `MISO_FADE_IN_MS` and out by
`MISO_FADE_OUT_MS`. Its length is capped by the
[length budget](miso-config.md#length-budget).
It carries Miso's imperceptible AI-generated-audio watermark, which
`generator.generate()` applies to the whole clip.

## POST /synthesise/stream

Same request body as `/synthesise`. The response body is raw audio, sent as
the model produces it, so the first bytes arrive after roughly
`MISO_STREAM_FIRST_FRAMES` frames (80 ms of audio each) have been generated, rather than after the whole clip.

Response `200`, `Content-Type: application/octet-stream`, headers:

| Header | Value |
| --- | --- |
| `X-Sample-Rate` | `24000` |
| `X-Audio-Format` | `pcm_f32le` |
| `X-Channels` | `1` |
| `Cache-Control` | `no-store` |

**Format:** little-endian IEEE float32 samples, mono, 24 kHz, no header. Every 4
bytes is one sample in [-1, 1]. Chunks can be any multiple of 4 bytes; join
them in order. The joined stream gets the same edge fades and length budget as
`/synthesise`, but it is a separate sampling run (so not the same audio), and
streamed audio is **not watermarked**: the
watermark needs the whole clip, which would cost the low first-byte latency.
(The server holds back the last `MISO_FADE_OUT_MS` of each chunk until it knows
whether more follows, so the fades match.)

Error behaviour:

- Validation, load, OOM and busy errors are reported **before** streaming
  starts, as a normal JSON error with the status codes above.
- Once the 200 has been sent there is no way to report an error. If generation
  fails, passes its deadline, or produces nothing for `MISO_STREAM_CHUNK_TIMEOUT_S`,
  the stream just ends early. The server logs the reason.
- A client that stops reading for `MISO_STREAM_STALL_S` is dropped and the GPU
  is released.

To play it in a browser, read the body into a `Float32Array` and queue it into
an `AudioBuffer` at 24000 Hz.

## Context

`context` lets a client pass back the previous utterance(s) so the next one
continues in the same voice and prosody:

```json
{
  "text": "And that is why I came back.",
  "voice_clone_id": "alice",
  "context": [
    {"text": "I left the city in March.", "audio": "<base64 of the bytes /synthesise/stream returned>"}
  ]
}
```

- `audio` is base64 of **pcm_f32le, 24 kHz mono** (exactly the stream format
  above). WAV files are not accepted here.
- At most `MISO_CONTEXT_MAX_SEGMENTS` (2) segments and `MISO_CONTEXT_MAX_SECONDS`
  (20) of audio in total. Over either limit is a 422.
- Each segment needs non-empty `text`. Audio that is not valid base64, is not a
  multiple of 4 bytes, holds NaN or infinite samples, or has any sample beyond ±4 (far outside
  [-1, 1], which means the wrong format, such as s16 bytes) is a 422.
- Segments go after the clone's reference audio. If the prompt would be too
  long, the oldest context segments are dropped first.

## POST /analyze-clips

Scores candidate reference clips so a UI can suggest which to use. Nothing is stored.

Request: `multipart/form-data` with one or more `audio` file parts (any format `torchaudio`/ffmpeg can read).

Response `200`:

```json
{
  "clips": [
    {
      "name": "clip1.wav", "score": 82, "rank": 0, "recommended": true,
      "flags": [], "consistency": null,
      "raw_seconds": 7.1, "speech_seconds": 6.4, "peak": 0.91,
      "clip_ratio": 0.0, "snr_db": 31.2, "noise_floor_dbfs": -58.3
    }
  ],
  "order": [0],
  "threshold": 60,
  "gpt_cond_len": 20,
  "engine": "miso"
}
```

- `score` (0–100) mixes SNR, usable speech length and clipping.
  `recommended` is `score >= MISO_ANALYZE_THRESHOLD`.
- `flags` can include `clipping`, `noisy`, `very_short`, `vad_no_speech`,
  `vad_failed:…`, `unreadable:…`.
- `speech_seconds` is `0` with `vad_no_speech`. With `vad_failed:…` it is
  unknown and falls back to `raw_seconds`.
- `order` lists clip indexes best first; `rank` is each clip's position in it.
- `consistency` is always `null`: Miso has no speaker embedding to compare clips with.
- `gpt_cond_len` is `MISO_REF_MAX_SECONDS`, kept under the XTTS key name.

Status: `422` when no `audio` parts are sent, or more than `MISO_MAX_CLIPS` (10).
`413` when a clip is over `MISO_MAX_CLIP_MB` (50 MB), or the whole body is over
`MISO_MAX_CLIPS` × `MISO_MAX_CLIP_MB` + 1 MB; the body check runs before anything is
written to disk.

## POST /clone-voice

Creates a one-shot clone. Miso does not train on the clips; it keeps cleaned-up
reference audio plus its transcript and conditions every generation on it.

Request: `multipart/form-data`:

| Field | Required | Notes |
| --- | --- | --- |
| `audio` | yes, one or more | Reference clips. Each is converted to mono 24 kHz, high-passed, VAD-trimmed (when `MISO_PREPROCESS=1`) and loudness-normalised, then all are joined and capped at `MISO_REF_MAX_SECONDS` |
| `companion_id` | yes | Storage id. Used as given in `voice_clones/<companion_id>/`; cloning the same id again replaces the clone but keeps any `temperature`/`topk` in its `meta.json` |
| `reference_text` | no | Transcript of the reference audio. Strongly recommended. If empty and `MISO_STT_URL` is set, each stored clip (trimmed, and cut at the cap) is sent to that engine's `POST /transcribe` and the texts are joined in clip order. A clip the cap cuts to under 0.5 s is not transcribed. A `reference_text` that no longer matches what is stored (a clip failed preprocessing, or the cap cut the reference) is replaced the same way, with the reason in `reference_text_discarded`; without `MISO_STT_URL` that is a `422` |
| `voice_name` | no | Display name; defaults to `companion_id` |
| `language` | no | Language of the clips, passed to the STT engine (region dropped: `en-US` → `en`). Default `en` |

Response `200`: the clone's metadata, plus `duration` and a per-clip
preprocessing report:

```json
{
  "voice_clone_id": "voice_clones/alice/prompt.pt",
  "companion_id": "alice",
  "name": "Alice",
  "num_clips": 2,
  "total_seconds": 11.3,
  "has_transcript": true,
  "reference_text_source": "stt",
  "reference_text_stt": {"language": "en"},
  "engine": "miso",
  "created_at": 1763000000.0,
  "duration": 11.3,
  "clips": [{"name": "a.wav", "original_seconds": 6.2, "applied": ["mono+24k", "highpass85", "vad_trim", "lufs_norm"], "warnings": []}]
}
```

`reference_text_source` is `"request"` (the caller sent `reference_text`), `"stt"`
(machine-made by the `MISO_STT_URL` engine) or `null` (no transcript). With `"stt"`,
`reference_text_stt` records the language asked for, plus the STT `engine` and `model`
when its answer names them. `num_clips` counts the clips in the clone: not one that
failed preprocessing, nor one that starts past `MISO_REF_MAX_SECONDS`.

Status: `422` with no clips, more than `MISO_MAX_CLIPS` (10), no usable audio after
preprocessing, or under 2 s of speech (6 s or more is recommended); `503` while
the model is loading. When the transcript comes from `MISO_STT_URL` and that fails, the
clone is refused and nothing is stored: `503` (STT busy, loading or unreachable;
`Retry-After` passed on, else 5), `504` (no answer within `MISO_STT_TIMEOUT_S` for a
clip) or `502` (any other STT error, an answer without `text`, or an empty transcript
for every clip). Send `reference_text` to clone without the STT engine. `413` when a clip is over `MISO_MAX_CLIP_MB` (50 MB), or the whole body is over
`MISO_MAX_CLIPS` × `MISO_MAX_CLIP_MB` + 1 MB; the body check runs before anything is
written to disk.

Stored layout, the same as the XTTS engine:

```
voice_clones/<companion_id>/prompt.pt   # torch dict: ref_audio, ref_text, speaker, sample_rate, engine
voice_clones/<companion_id>/meta.json   # the metadata above
```

Only the server writes `prompt.pt` (from `/clone-voice`, or re-serialised from a
validated import), so stored clones keep that format. Archives that leave or enter
the engine use `prompt.safetensors` instead; see below.

To pin sampling for a voice, add `"temperature"` and/or `"topk"` to its
`meta.json`. Request fields still take precedence; invalid values are ignored.

## GET /clones

Response `200`: `{"clones": [<meta.json>, ...]}`, newest first. `500` if storage can't be listed.

## GET /clones/{companion_id}/download

Response `200`: `application/zip` named `<companion_id>.zip`, holding
`prompt.safetensors` and, if present, `meta.json`. `404` if the clone does not exist.
Clones stored by earlier versions are converted on the way out.

The clone archive format:

| Member | Contents |
| --- | --- |
| `prompt.safetensors` | Tensors: `ref_audio` (float32, 1-D, at `sample_rate`). The safetensors `__metadata__` header holds the scalar fields as strings: `speaker` (integer), `sample_rate` (positive integer), `ref_text` (the transcript), plus `engine` (`miso`), `format` (`miso-clone`) and `format_version` (`1`) |
| `meta.json` | The clone's metadata (`name`, `companion_id`, `temperature`, `topk`, ...), as listed by `/clones` |

Archives made before this format held `prompt.pt` (a torch pickle) and can no
longer be imported; see below.

## DELETE /clones/{companion_id}

`companion_id` can be the stored id, a full `voice_clones/<id>/…` key, or the
clone's display name (matched case-insensitively, and also as a slug).

Response `200`: `{"status": "deleted", "companion_id": "<as given>"}`. `404` if nothing matched.

## POST /clones/import

Imports a zip made by `/clones/{id}/download`.

Request: `multipart/form-data`:

| Field | Required | Notes |
| --- | --- | --- |
| `archive` | yes | The zip. Must contain a `prompt.safetensors` (up to 64 MB) with a `ref_audio` tensor; `meta.json` (up to 1 MB) is optional |
| `companion_id` | no | Id to store under. Default: the archive's `companion_id`, then `voice_name`, then its name. Always slugified |
| `voice_name` | no | Display name override |
| `replace` | no | `true` overwrites a clone already stored under the target id. Default `false` |

`prompt.safetensors` is parsed with `safetensors.torch.load`, which reads a JSON
header and raw tensor bytes, so an archive cannot run code. Nothing uploaded is
ever unpickled: an archive that holds only a legacy `prompt.pt` is refused
without being read (`torch.load(weights_only=True)` is CVE-2025-32434 on Miso's
torch 2.4, and later torch releases keep finding unpickler bypasses). Re-export
such a clone from an engine running this version, whose download produces
`prompt.safetensors`. A missing `ref_text` in the metadata falls back to
`meta.json`'s `ref_text`; a missing `speaker` or `sample_rate` takes the engine
default.

Response `200`: the new metadata (with `"imported": true`) plus `duration`.
`413` if the archive is over `MISO_MAX_ARCHIVE_MB` (64 MB by default), or the
body over that + 1 MB (refused before it is written to disk). `409` if the
target id already has a clone and `replace` is not `true`. `422`
for a bad zip, a missing or malformed `prompt.safetensors` (including a
non-integer `speaker`, a non-positive or non-integer `sample_rate`, non-string
metadata, or a missing or empty `ref_audio`), an archive with only a legacy
`prompt.pt`, or a `prompt.safetensors` or `meta.json` that is too large.

## GET /speakers

Response `200`:

```json
{"speakers": [{"id": "0", "name": "Speaker 0", "language": "en", "languages": ["en"]}, ...]}
```

`MISO_NUM_SPEAKERS` (2) entries. Miso has no named voices; use these ids as
`speaker`, or use a clone.

## GET /health

Response `200`:

```json
{
  "status": "ok",
  "busy": true,
  "active": {"request_id": "…", "endpoint": "stream", "busy_s": 3.2},
  "engine": "miso",
  "model": "MisoLabs/MisoTTS",
  "device": "cuda",
  "model_state": "gpu",
  "sample_rate": 24000,
  "storage": "local",
  "keep_alive_gpu": 300.0,
  "keep_alive_cpu": 0.0,
  "idle_s": 12.4,
  "error": null,
  "rss_mb": 2150.3,
  "gpu": {"allocated_mb": 16890.2, "reserved_mb": 17204.0, "total_mb": 24564.0}
}
```

The body also carries `capabilities`, `image` and argus-cortex's `ServiceHealth` fields (`service`, `version`,
`started_at`, `checks`, `build`, `peer` and the rest), described in
[api.md](api.md#health-and-lifecycle).

- `status`: `ok`, or `degraded` (still `200`) while `model_state` is `error`.

- `model_state`: `unloaded`, `loading`, `cpu`, `gpu` or `error`. In `error`,
  `error` holds the last load failure; the next request tries to load again.
- `busy`: `true` while a request holds the GPU lock, else `false` (the
  argus-cortex `ResidentHealth` contract).
- `active`: the request holding the GPU lock, or `null`.
- `idle_s`: seconds since the last request, only in the `gpu` and `cpu` states.
- `503 {"status": "loading"}` while the model loads.
- `503` with `"status": "stuck"`, the fields above and `stuck_after_s` when the GPU lock has been
  held longer than any generation could take (`MISO_STUCK_AFTER_S`). With
  `MISO_STUCK_EXIT=1` (default) the process exits with code 70 soon after, so a
  container restart policy brings it back.

## GET /media/{key}

Serves files from the local storage backend by storage key, for example the
keys `generated/voice/<uuid>.wav` or `voice_clones/<id>/meta.json`.
`404` if the file is missing, or always when `MISO_STORAGE_BACKEND=s3` (URLs
then point at S3 directly).

## Admin

These routes need `Authorization: Bearer <ARGUS_ADMIN_TOKEN>` and answer
`401` without it. While `ARGUS_ADMIN_TOKEN` is empty they answer `503`, unless
`ARGUS_ADMIN_INSECURE=1` opens them for local development. No other route has
authentication: see [Security](api.md#security).

| Route | Effect | Response |
| --- | --- | --- |
| `POST /admin/evict` | Move the model from GPU to CPU RAM | `{"status": "evicted", "model_state": "cpu"}` |
| `POST /admin/unload` | Drop the model and free GPU and RAM | `{"status": "unloaded", "model_state": "unloaded"}` |
| `POST /admin/wake` | Load (or promote) the model to the GPU now | `{"status": "ready", "model_state": "gpu"}`, or a [load error](#status-codes-shared-by-the-synthesis-routes) |
