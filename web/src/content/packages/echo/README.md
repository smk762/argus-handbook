# argus-echo

The Argus suite's speech servers: three text-to-speech engines behind one HTTP contract, so a client switches
engine by changing a URL, and a speech-to-text engine:

| Engine | Model | VRAM | Strengths |
| --- | --- | --- | --- |
| **xtts** | [Coqui XTTS-v2](https://huggingface.co/coqui/XTTS-v2) | ~2 GB | **The suite's cloning engine**: multi-clip cloning, 58 built-in speakers, 17 languages, low-latency streaming. Weights non-commercial (CPML) |
| **miso** | [Miso TTS 8B](https://huggingface.co/MisoLabs/MisoTTS) | ~17 GB | Most natural and expressive, English only; one-shot cloning, but no built-in voices |
| **qwen** | [Qwen3-TTS](https://huggingface.co/Qwen) 0.6B / 1.7B | small | Built-in speakers, steered by an instruction or a voice description (1.7B) |
| **whisper** | [Whisper large-v3-turbo](https://huggingface.co/openai/whisper-large-v3-turbo) (faster-whisper) | ~3 GB | Speech to text: 99 languages, word timestamps, live streaming with VAD |

**Clone voices on XTTS.** It's the suite's one cloning engine (argus-echo#51): it has the most built-in speakers,
takes several reference clips, speaks 17 languages and fits an 8 GB card. Clones and fine-tunes (argus-forge) go
through it. Miso stays an English-only option where quality matters most, and Qwen offers its built-in speakers.
The caveat: XTTS-v2's weights are non-commercial (Coqui Public Model Licence), so its clones and fine-tunes are
too; Qwen3-TTS (Apache-2.0) is the fallback if that ever matters.

Plus **Wyoming bridges** that put any engine, text to speech or speech to text, in front of Home Assistant or
anything else that speaks [Wyoming](https://github.com/OHF-Voice/wyoming).

Every engine loads its model on first use, unloads it when idle, and serves argus-cortex's resident contract
(`/health`, `/admin/{unload,evict,wake}`), so [argus-iris](https://github.com/smk762/argus-iris) can share a GPU
between them and other services. [argus-mask](https://github.com/smk762/argus-mask) uses them to give its faces a
voice.

Part of the [Argus suite](https://github.com/smk762/argus-cortex/blob/dev/SUITE.md).

## Run

Linux, Docker with Compose, an NVIDIA GPU and the
[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html).
Each engine is a Compose profile; run the ones your GPU can hold:

```sh
cp .env.example .env                                         # bind address, token, storage
docker compose --profile miso up -d --build                  # 24 GB card
docker compose --profile xtts --profile qwen up -d --build   # 8 GB card
```

To share the GPU through [argus-iris](https://github.com/smk762/argus-iris), set `ARGUS_GPU_BROKER_URL` (and
`ARGUS_GPU_BROKER_TOKEN` if the broker has one) next to `ARGUS_ADMIN_TOKEN` in `.env`. That is all: each engine
registers [gpu-tenant.yaml](gpu-tenant.yaml) at startup, and iris places each resident on the node whose agent
reports its container, calling its `/admin/*` routes with the admin token the engine sent. Every engine registered
with one broker must share one `ARGUS_ADMIN_TOKEN`. Unset, nothing registers; a broker that is down never stops an
engine starting.

Values every Argus service on a host shares (the broker URL and token, `ARGUS_ADMIN_TOKEN`, `HF_TOKEN`, the `S3_*`
credentials) can be written once in the suite settings file, `~/.config/argus/suite.env` (mode 600;
`python -m argus_cortex.settings --init` creates it), instead of in each repo's `.env`. Each engine reads it at
startup for whatever its own environment leaves unset or empty, so a value in `.env` still wins. Under Compose, add
[`compose.suite.yaml`](compose.suite.yaml) to mount the file read-only at `/etc/argus/suite.env`
(`COMPOSE_FILE=compose.yaml:compose.suite.yaml` in `.env`); it is a separate file because a host without a suite
file could not start with the mount in place. One limit today
([argus-cortex#218](https://github.com/smk762/argus-cortex/issues/218)): the engines run as root, and the file is
read only when root owns it, so the mounted file must be root-owned; one owned by your own user is ignored with a
warning.

Each engine container carries the suite's discovery labels (`argus.peer`, `argus.service`, `argus.health`,
`argus.port`), which argus-iris's agents read to list the suite's services. The peer names, which are what callers
ask for (`ARGUS_<PEER>_URL`), are `miso`, `xtts`, `tts` (Qwen) and `whisper`.

Ports: Miso `8140`, XTTS `8141`, Qwen `8142`, Whisper `8144`; Wyoming bridges `10240` (XTTS), `10241` (Miso),
`10242` (Qwen) and `10243` (Whisper), see [Home Assistant](docs/voice-cloning.md#home-assistant). They are published on
`ECHO_BIND`, which defaults to `127.0.0.1`; set it to `0.0.0.0` or a LAN address to serve other machines. Miso downloads its ~33 GB checkpoint into `HF_HOME` on first use; the XTTS and Qwen images bake their
weights in at build time.

Check an engine (read-only; `--speak` also streams a sentence, which loads the model):

```sh
uvx argus-echo check http://localhost:8140
uvx argus-echo check http://localhost:8141 --speak "Hello there." --speaker "Claribel Dervla"
uvx argus-echo check http://localhost:8144 --transcribe       # speech to text: a bundled 11 s clip
```

Or by hand:

```sh
curl -s localhost:8140/synthesise/stream -H 'content-type: application/json' \
     -d '{"text": "Hello there."}' --output hello.f32       # 24 kHz mono float32
```

## Storage

Generated WAVs and clones go to S3 (MinIO or any S3-compatible store): set `S3_ENDPOINT_URL` and the credentials
in `.env`. Each engine has **its own bucket** (`voice-miso`, `voice-xtts`, `voice-qwen` by default), because all
three store clones under the same keys in different formats. Create the buckets before first use. Miso can store
on local disk instead (`MISO_STORAGE_BACKEND=local`, the default) and serves those files itself.

## Security

`/admin/*` is closed until `ARGUS_ADMIN_TOKEN` is set (`openssl rand -hex 32`). **Every other route is open**,
clone creation and deletion included: keep the ports on a trusted network or behind an authenticating gateway.
Clone a real person's voice only with their consent. Details: [docs/api.md#security](docs/api.md#security).

## Documentation

| Doc | Contents |
| --- | --- |
| [docs/api.md](docs/api.md) | The shared contract, how the engines differ, health, admin, security |
| [docs/miso-api.md](docs/miso-api.md), [docs/miso-config.md](docs/miso-config.md) | Miso's full API and every `MISO_*` setting |
| [docs/xtts.md](docs/xtts.md) | XTTS-v2 settings and licence |
| [docs/qwen.md](docs/qwen.md) | Qwen3-TTS settings and differences |
| [docs/whisper.md](docs/whisper.md) | Speech to text: model choice, licences, VRAM, settings |
| [docs/new-engine.md](docs/new-engine.md) | Checklist for adding an engine (server, image, tests, wiring) |
| [docs/voice-cloning.md](docs/voice-cloning.md) | What makes a good reference on each engine; Home Assistant |

## Layout

```
compose.yaml          one profile per engine
gpu-tenant.yaml       the residents argus-iris manages
engines/<engine>/     each engine's server, Dockerfile and tests (its own Python environment)
src/argus_echo/       the contracts in Python (contract/tts.py, contract/stt.py), and `argus-echo check`
```

The engines don't import `argus_echo`: their dependencies conflict (Miso pins torch 2.9 for moshi), so they share the
contract, not code.

## Develop

```sh
make install && make test && make lint      # the argus_echo package
```

Each engine's tests run in its own environment, with the models stubbed (no GPU or weights). The commands are in
[.github/workflows/engines.yml](.github/workflows/engines.yml), for example:

```sh
cd engines/xtts && uv run --no-project --python 3.11 --with-requirements requirements-test.txt python -m pytest -q tests
```

## Licence

MIT, see [LICENSE](LICENSE), except [engines/miso/](engines/miso/), which carries the upstream MisoTTS inference
code under Miso Labs' modified MIT licence ([engines/miso/LICENSE](engines/miso/LICENSE)). Model weights carry
their own licences: Miso TTS (modified MIT), XTTS-v2 (Coqui Public Model Licence, **non-commercial**), Qwen3-TTS
(Apache-2.0). Audio from Miso's `/synthesise` carries an imperceptible AI-generated watermark; streamed audio does
not.
