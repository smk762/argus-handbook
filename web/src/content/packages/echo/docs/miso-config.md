# Miso TTS configuration

Every setting is an environment variable read once at startup (except
`MISO_NUM_SPEAKERS`, read on each `GET /speakers`) by
[engines/miso/miso_server.py](../engines/miso/miso_server.py). Durations are in seconds
unless the name ends in `_MS`.

## Model and server

| Variable | Default | Effect |
| --- | --- | --- |
| `MISO_MODEL` | `MisoLabs/MisoTTS` | Hugging Face repo id or local path passed to `load_miso_8b` |
| `MISO_DEVICE` | `cuda` | `cuda` (or `cuda:N`) or `cpu` |
| `MISO_PORT` | `8034` | Listen port when started with `python miso_server.py`. Also used in the fallback `audio_url` |
| `MISO_PRELOAD` | `0` | `1` loads the model at startup; otherwise the first request loads it |

Under Docker Compose the container always listens on `8031`. `compose.yaml`
publishes it as `${ECHO_BIND:-127.0.0.1}:${MISO_PORT:-8140}`, so on the host
`MISO_PORT` is the published port and `ECHO_BIND` the address it listens on. Because the server cannot see the
published address, set `MISO_PUBLIC_URL` (see [Storage](#storage)).

[engines/miso/generator.py](../engines/miso/generator.py) reads a few more:

| Variable | Default | Effect |
| --- | --- | --- |
| `MISO_TTS_TOKENIZER` | `unsloth/Llama-3.2-1B` | Hugging Face repo for the Llama 3.2 text tokenizer. The default is an ungated mirror; `meta-llama/Llama-3.2-1B` works if you have access |
| `HF_HUB_ETAG_TIMEOUT`, `HF_HUB_DOWNLOAD_TIMEOUT` | `60` | Hugging Face Hub timeouts; set only if not already set |

The Hugging Face library's own variables (`HF_TOKEN`, `HF_HOME`) apply as usual.

## Sampling

| Variable | Default | Effect |
| --- | --- | --- |
| `MISO_TEMPERATURE` | `0.9` | Default temperature, clamped to 0.1–1.5 |
| `MISO_TOPK` | `50` | Default top-k, clamped to 1–200 |
| `MISO_DEFAULT_SPEAKER` | `0` | Integer speaker for requests with no `speaker` or clone, and for new clones |
| `MISO_NUM_SPEAKERS` | `2` | How many ids `GET /speakers` lists |

Per request, `temperature` and `topk` override these; a clone's `meta.json`
can set them per voice. Order: request, then `meta.json`, then these defaults.

## Length budget

A generation may produce at most
`min(MISO_MAX_AUDIO_MS, (MISO_LENGTH_PAD_S + words / MISO_MIN_WORDS_PER_S) × 1000)` ms.
This stops a short sentence that misses its end-of-speech token from rambling
on for the full 30 s.

| Variable | Default | Effect |
| --- | --- | --- |
| `MISO_MAX_AUDIO_MS` | `30000` | Hard ceiling per utterance |
| `MISO_MIN_WORDS_PER_S` | `1.6` | Slowest reading rate allowed for. Lower it if slow voices get cut off. `0` or less disables the word-based budget (always `MISO_MAX_AUDIO_MS`) |
| `MISO_LENGTH_PAD_S` | `1.5` | Fixed seconds added to the budget |

## Fades

| Variable | Default | Effect |
| --- | --- | --- |
| `MISO_FADE_IN_MS` | `5` | Fade-in at the start of each utterance. `0` = off |
| `MISO_FADE_OUT_MS` | `30` | Fade-out at the end. `0` = off. The stream holds this much back from each chunk until the next chunk or the end |

## Streaming

| Variable | Default | Effect |
| --- | --- | --- |
| `MISO_STREAM_FIRST_FRAMES` | `5` | Frames (80 ms each) decoded before the first chunk is sent. Lower means faster first byte |
| `MISO_STREAM_DECODE_FRAMES` | `12` | Frames per later chunk. Higher means less decode overhead |
| `MISO_STREAM_CHUNK_MS` | `240` | Read but currently unused; chunking follows the two settings above |

## Request context

| Variable | Default | Effect |
| --- | --- | --- |
| `MISO_CONTEXT_MAX_SEGMENTS` | `2` | Most `context` segments a request may send |
| `MISO_CONTEXT_MAX_SECONDS` | `20` | Most context audio, per segment and in total |

## Voice cloning

| Variable | Default | Effect |
| --- | --- | --- |
| `MISO_REF_MAX_SECONDS` | `20` | Reference audio kept per clone after preprocessing |
| `MISO_MAX_CLIP_MB` | `50` | Largest single clip `/clone-voice` and `/analyze-clips` accept; a larger one is `413` |
| `MISO_MAX_ARCHIVE_MB` | `64` | Largest zip `/clones/import` accepts; a larger one is `413` |
| `MISO_MAX_CLIPS` | `10` | Most clips one `/clone-voice` or `/analyze-clips` request takes; more is `422`. The whole upload body is capped at `MISO_MAX_CLIPS` × `MISO_MAX_CLIP_MB` (or `MISO_MAX_ARCHIVE_MB` for `/clones/import`) plus 1 MB, and is refused with `413` before it is written to disk |
| `MISO_PREPROCESS` | `1` | `1` trims silence and non-speech from each clip with VAD. `0` skips the trim; the high-pass, length cap and loudness normalisation always run |
| `MISO_STT_URL` | empty | Echo's speech-to-text engine (the whisper engine, e.g. `http://whisper:8031`). `/clone-voice` with an empty `reference_text` sends each clip to its `POST /transcribe`; a failure refuses the clone (`502`/`503`/`504`). Resolved as an argus-cortex peer: this variable, then `MISO_WHISPER_URL` (the old name), then the suite-wide `ARGUS_WHISPER_URL` (environment or the suite file); an empty one falls through to the next. None set: such clones have no transcript and clone quality drops. `off` keeps it off whatever the suite sets. A value that is not an absolute `http(s)` URL stops the server at startup, naming the variable. Env only, never a request field |
| `MISO_STT_TIMEOUT_S` | `60` | Timeout for each clip's transcription request |
| `MISO_ANALYZE_THRESHOLD` | `60` | `/analyze-clips` score at or above which a clip is `recommended` |

## Admin

| Variable | Default | Effect |
| --- | --- | --- |
| `ARGUS_ADMIN_TOKEN` | empty | `/admin/*` needs `Authorization: Bearer <token>` (else `401`). While it is empty the routes answer `503` |
| `ARGUS_ADMIN_INSECURE` | empty | `1` opens `/admin/*` while `ARGUS_ADMIN_TOKEN` is empty. Local development only |

## Idle lifecycle

The model moves between `unloaded`, `cpu` and `gpu`. After each request:

1. After `MISO_KEEP_ALIVE_GPU` idle seconds on the GPU, it leaves the GPU.
2. If `MISO_KEEP_ALIVE_CPU` is above 0 it waits that long on CPU, then unloads.
   If it is 0 it unloads straight away.

The next request reloads (or promotes) it, which adds the load time to that request.

| Variable | Default | Effect |
| --- | --- | --- |
| `MISO_KEEP_ALIVE_GPU` | `300` | Idle seconds on the GPU. `-1` = never leave the GPU. `0` = leave right after every request (each request then pays a full reload) |
| `MISO_KEEP_ALIVE_CPU` | `0` | Idle seconds parked on CPU before unloading. `0` = skip the CPU stage (the 8B model holds about 17 GB of RAM on CPU). `-1` = stay on CPU for ever |
| `MISO_OOM_RETRY_AFTER_S` | `30` | `Retry-After` on a 503 caused by a CUDA OOM. A failed load keeps no partial copy in memory, so a retry starts clean |

With `MISO_DEVICE=cpu` the model is always on CPU, and its idle time before
unloading is the two values added together.

## GPU lock and watchdog

One generation holds the GPU at a time.

| Variable | Default | Effect |
| --- | --- | --- |
| `MISO_LOCK_WAIT_S` | `120` | How long a request waits for the GPU before a 503 busy. `0` = wait for ever |
| `MISO_GEN_TIMEOUT_PAD_S` | `30` | A generation is abandoned after `PAD + FACTOR × audio budget (s)`. With the defaults and a 30 s budget that is 210 s |
| `MISO_GEN_TIMEOUT_FACTOR` | `6` | See above |
| `MISO_STREAM_STALL_S` | `30` | A stream whose client reads nothing for this long is stopped and the GPU released |
| `MISO_STREAM_CHUNK_TIMEOUT_S` | `60` | A stream that gets no new audio for this long is ended |
| `MISO_STUCK_AFTER_S` | `0` (auto) | Lock held longer than this marks the server stuck: `/health` returns 503 `"stuck"`. `0` means the longest possible generation + `MISO_STREAM_STALL_S` + 60 (300 s with defaults) |
| `MISO_STUCK_EXIT` | `1` | `1` exits the process (code 70) when stuck, so `restart: unless-stopped` or a supervisor starts a fresh one. A thread stuck inside the model cannot be stopped any other way |

## Storage

| Variable | Default | Effect |
| --- | --- | --- |
| `MISO_STORAGE_BACKEND` | `local` | `local` or `s3` |
| `MISO_DATA_DIR` | `./miso-data` | Local backend root (relative to the working directory) |
| `MISO_PUBLIC_URL` | empty | Base URL put in `audio_url` for the local backend, for example `http://tts.lan:8140`. **Set this** whenever clients are on another machine or the server runs in a container |
| `MISO_PUBLIC_HOST` | empty | Host used if `MISO_PUBLIC_URL` is empty: `http://<host>:<MISO_PORT>`. If both are empty the server uses the IP its hostname resolves to |

S3 backend (`MISO_STORAGE_BACKEND=s3`). The endpoint, bucket and public URL
default to a MinIO on `localhost`, which suits a quick local test only. The
credentials have no default: the server refuses to start without both.
**Set all five** for anything else:

| Variable | Default | Effect |
| --- | --- | --- |
| `S3_ENDPOINT_URL` | `http://localhost:9000` | S3 API endpoint |
| `S3_ACCESS_KEY_ID` | none, required | Access key. Use a key scoped to the bucket, not the store's root account |
| `S3_SECRET_ACCESS_KEY` | none, required | Secret key |
| `S3_BUCKET_NAME` | `voice` | Bucket (must exist) |
| `S3_PUBLIC_URL` | `http://localhost:9000/voice` | Public base for returned URLs: `<S3_PUBLIC_URL>/<key>`. The objects must be readable there |

Both backends use the same keys: `generated/voice/<uuid>.wav` for synthesis
output and `voice_clones/<companion_id>/{prompt.pt,meta.json}` for clones.
Generated WAVs are never deleted by the server.
