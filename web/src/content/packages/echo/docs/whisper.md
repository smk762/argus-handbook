# Whisper (speech to text)

The `whisper` engine serves the [`stt` contract](api.md#speech-to-text) with
[faster-whisper](https://github.com/SYSTRAN/faster-whisper) running OpenAI's Whisper **large-v3-turbo** on
CTranslate2, float16 on the GPU.

## Licences

| Part | Licence |
| --- | --- |
| Whisper large-v3-turbo weights ([openai/whisper-large-v3-turbo](https://huggingface.co/openai/whisper-large-v3-turbo)) | MIT |
| CTranslate2 conversion ([mobiuslabsgmbh/faster-whisper-large-v3-turbo](https://huggingface.co/mobiuslabsgmbh/faster-whisper-large-v3-turbo), the repo faster-whisper's own `large-v3-turbo` alias uses) | MIT |
| faster-whisper, CTranslate2 | MIT |
| Silero VAD (bundled with faster-whisper, used by the stream) | MIT |

The weights are pinned to commit `0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf` of the conversion repo and baked into the
image (`STT_MODEL`, `STT_MODEL_REVISION` build args). `/health` reports both.

## Why this model

Measured on an RTX 3090, one model per process, beam 5, on 10 English sentences synthesised by the XTTS engine
(clean and with white noise at 5 dB SNR), their 45 s concatenation, and four 35-40 s XTTS takes
(272 s of audio in all). WER is after lower-casing, removing punctuation and spelling out digits.

| | faster-whisper large-v3-turbo | Parakeet TDT 0.6B v2 | Parakeet TDT 0.6B v3 |
| --- | --- | --- | --- |
| Runtime | CTranslate2 fp16 | NeMo 3.0 / torch fp32 | NeMo 3.0 / torch fp32 |
| Languages | 99, with detection | English | 25 European |
| WER clean / 5 dB noise / 45 s | 0.0 / 0.8 / 0.0 % | 3.9 / 0.8 / 0.0 % | 0.0 / 1.6 / 0.0 % |
| Speed (RTFx, whole set) | 35x | 187x | 181x |
| Median latency, 4 s clip | 234 ms | 46 ms | 45 ms |
| Peak VRAM (process) | 2.4 GB | 5.4 GB | 5.4 GB |
| Peak host RAM | 2.3 GB | 4.8 GB | 3.9 GB |
| Weights licence | MIT | CC-BY-4.0 | CC-BY-4.0 |

On the four long takes, with no reference text, the Parakeet models and Whisper disagreed on 7-8 % of words, mostly
number formatting (`22` / `twenty-two`, `9.30am` / `9:30 AM`) and the odd word each way.

Parakeet is about five times faster, but Whisper wins where echo's callers need it: it is multilingual with
language detection (curator scores speech datasets in any language, and Parakeet v2 is English only), it needs
less than half the VRAM and RAM, its image carries no torch or NeMo, and its weights are MIT. A quarter of a
second for a short clip is fast enough for curator's one-clip-at-a-time CER pass and for live captions. The
sample is small, so the WER figures only show that both are accurate on clean synthetic speech, not which is more
accurate in general.

## The engine

As measured in the engine itself (CUDA context included):

| State | VRAM | Host RAM |
| --- | --- | --- |
| Unloaded, before first use | none | ~0.8 GB |
| Loaded, idle | 2.4 GB | ~0.8 GB |
| Peak, 40 s clip with word timestamps | 2.8 GB | ~0.9 GB |
| Evicted (`/admin/evict`) | 0.5 GB (context) | ~2.5 GB |
| Unloaded after use | 0.5 GB (context) | ~0.8 GB |

CTranslate2 keeps its CUDA context until the process exits; `gpu-tenant.yaml` declares 3000 MB. The Dockerfile caps
CTranslate2's caching allocator at 200 MiB of cached blocks (`CT2_CUDA_CACHING_ALLOCATOR_CONFIG=4,3,12,209715200`),
and transcriptions run one at a time, so the footprint stays at the working set of one request.

| Variable | Default | |
| --- | --- | --- |
| `STT_DEVICE` | `cuda` | `cpu` runs int8 on the CPU |
| `STT_COMPUTE_TYPE` | `float16` (`int8` on CPU) | Any CTranslate2 compute type; `int8_float16` saves VRAM |
| `STT_BEAM_SIZE` | `5` | |
| `STT_PRELOAD` | `0` | `1` loads at startup |
| `STT_KEEP_ALIVE_GPU` / `STT_KEEP_ALIVE_CPU` | `300` / `600` | Idle seconds before moving to RAM / freeing; negative pins |
| `STT_CONCURRENCY` | `1` | Transcriptions at once |
| `STT_QUEUE_TIMEOUT_S` | `30` | Wait for a slot before `503` |
| `STT_MAX_UPLOAD_MB` / `STT_MAX_SECONDS` | `50` / `600` | Upload caps |
| `STT_STREAM_MAX_SESSIONS` | `4` | Open streams |
| `STT_STREAM_MIN_SILENCE_MS` | `600` | Silence that ends an utterance |
| `STT_STREAM_MAX_UTTERANCE_S` | `30` | Longest utterance |
| `STT_STREAM_PARTIAL_S` | `1.0` | Seconds of speech between partials; `0` sends none |
| `STT_VAD_THRESHOLD` | `0.5` | Silero speech probability |
| `STT_VAD_FILTER` | `1` | `/transcriptions` only: faster-whisper's Silero VAD filter (drops silence before Whisper runs) (`/transcribe` never) |
| `STT_AUDIO_URL_ALLOWED_HOSTS` | empty | `/transcriptions`: `host` or `host:port` entries (comma-separated) whose `audio_url` may resolve to a private address, e.g. `minio:9000` |
| `STT_AUDIO_URL_MAX_REDIRECTS` | `0` | Redirects an `audio_url` fetch follows; each hop is checked again |
| `STT_DOWNLOAD_TIMEOUT` | `30` | Seconds for a whole `audio_url` fetch |
| `STT_INPUT_FORMATS` | plain audio containers | ffmpeg demuxers `/transcriptions` may use for audio that isn't WAV/FLAC (comma-separated; never a playlist demuxer); `none`: WAV/FLAC only |
| `STT_DECODE_TIMEOUT` | `120` | Seconds for one ffmpeg decode |

compose maps `WHISPER_*` onto these (see `.env.example`). The `/transcriptions` settings keep agent-composer's
names (its sidecar used the same `STT_*` prefix), except the byte cap: composer's `STT_MAX_AUDIO_BYTES` is
`STT_MAX_UPLOAD_MB` here, shared with `/transcribe`.

## Home Assistant

`--profile wyoming-whisper` runs a Wyoming ASR bridge on `10243` that forwards each utterance to `POST /transcribe`,
so Home Assistant's voice pipeline can use this engine for speech to text. Settings and behaviour:
[voice-cloning.md#home-assistant](voice-cloning.md#home-assistant).
