# Adding an engine

Every echo engine is its own server, environment and image, but they share a skeleton. Copy the parts below from
**[engines/whisper/](../engines/whisper/)**, the newest engine and the closest to current conventions, rather than
from whichever engine is nearest in kind. Each item names where whisper does it.

## The server (`engines/<engine>/<engine>_server.py`)

- [ ] **One FastAPI app listening on `8031`** inside the container. A module docstring lists the routes, the GPU
      lifecycle and every env var with its default (`stt_server.py`, top of file).
- [ ] **Its own env prefix** (`STT_*` for whisper; `MISO_*`, `XTTS_*`, `TTS_*` for the others). Compose maps the
      operator-facing names (`WHISPER_*`) onto it.
- [ ] **The contract for each capability it serves**, exactly as docs/api.md and
      `src/argus_echo/contract/<capability>.py` state it. A new capability needs its contract module, its docs/api.md
      section and its `argus-echo check` suite first ([#2](https://github.com/smk762/argus-echo/issues/2)).
- [ ] **`GET /health` is argus-cortex `ResidentHealth` and `ServiceHealth`**, served by
      `argus_cortex.service.install_health(app, service="argus-echo", version=ECHO_VERSION, build=ECHO_REVISION,
      capabilities=CAPABILITIES, checks={"model": ...}, extra=_health_fields, check_ttl_s=0)`: top-level
      `model_state`, `busy` (a bool), `idle_s`, and a memory-only `gpu` block, plus `engine`, `model`, `device` and
      **`capabilities`** (`_health_fields()`, `_gpu_block()`). A failed load is `status: degraded`, still `200`
      (argus-iris raises on anything else). `503 {"status": "loading"}` while loading, answered by the
      `_UnreadyHealth` middleware (`_health_unready()`), not by `readiness=`.
- [ ] **A model manager**: `unloaded -> loading -> gpu <-> cpu -> unloaded`. Work holds a lease for its whole run;
      evict and unload wait for leases to drop; keep-alive timers demote GPU to RAM, then free it; a negative
      keep-alive pins that stage; a load runs shielded so a cancelled request can't strand `loading`
      (`ModelManager`).
- [ ] **Admin routes** `POST /admin/{evict,unload,wake}` behind `argus_cortex.auth.bearer("ARGUS_ADMIN_TOKEN")`,
      **closed (503) when the token is unset** unless `ARGUS_ADMIN_INSECURE=1`, read per request. A busy model
      answers `409` (`_require_admin`, `admin_*`). Log a warning at startup when the token is unset.
- [ ] **Uploads through `argus_cortex.limits`** (`read_upload`, and `open_audio` for audio): byte, format, channel,
      rate and duration caps are checked before decoding (`transcribe()`).
- [ ] **Bounded concurrency**: a semaphore sized by an env var and a bounded queue wait that answers
      `503` + `Retry-After` (`_slots`, `run_transcription`). Out of memory is a retryable `503`.
- [ ] **Never import `argus_echo`** (the engine's environment doesn't have it; `tests/test_repo_rules.py` checks).
      Talking to another engine is a small httpx client with a bounded timeout, URL from env only.
- [ ] **Storage**: if the engine keeps clones or output, it gets its own bucket (`<ENGINE>_S3_BUCKET` in compose,
      checked distinct by `tests/test_repo_rules.py`), no default credentials, and anything kept is stated in the
      engine's docs. Whisper keeps nothing.

## Environment and image

- [ ] `requirements.txt` (what the image installs) and `requirements-test.txt` (what CI installs: the server's
      imports minus the heavy model libraries, which the tests fake). Miso, with a vendored model, locks its own
      `pyproject.toml` / `uv.lock` instead.
- [ ] A `Dockerfile` from a slim Python base: weights **pinned to a commit** and baked in, the VRAM cap set in the
      environment, `EXPOSE 8031`, `uvicorn <module>:app --port 8031`. Name the licences in a header comment.

## Tests (`engines/<engine>/tests/`)

- [ ] A fake backend so no model, GPU or weights are needed (whisper's fake model and fake VAD).
- [ ] `test_health`: `/health` validates as `ResidentHealth` and names its capabilities.
- [ ] Admin routes closed without a token, open with it, 409 while busy.
- [ ] Upload caps refuse before the model loads.
- [ ] The manager: leases block eviction, keep-alive demotes then frees, a failed load lands in `error`.
- [ ] Lint: `uvx ruff@0.15.16 check --select E9,F63,F7,F82 .` at least; new engines should pass full `ruff check`.

## Wiring

- [ ] **`compose.yaml`**: a profile named after the engine, `ports: "${ECHO_BIND:-127.0.0.1}:${<ENGINE>_PORT:-81xx}:8031"`,
      the env mapping, `ARGUS_ADMIN_TOKEN`/`ARGUS_ADMIN_INSECURE`, `ARGUS_GPU_BROKER_URL`/`ARGUS_GPU_BROKER_TOKEN`,
      the `gpu-tenant.yaml` mount at `/app/gpu-tenant.yaml`, the shared `*health` healthcheck and `*gpu` blocks.
      Add it to `.env.example`.
- [ ] **Broker registration**: the lifespan wraps its body in
      `async with aregistered(coordinator_from_env()):` (`argus_cortex.gpu`, with cortex's `[remote,yaml]` extras),
      and a `test_broker_registration` like whisper's.
- [ ] **`gpu-tenant.yaml`**: a resident with the **measured** peak `vram_mb` (say how it was measured in a comment),
      `health_path`, `unload_path`, `evict_path`, `warm_path`, `admin_auth: true`.
- [ ] **CI**: the engine in `.github/workflows/engines.yml`'s test matrix and the `compose` job's profile loop, and in
      `release.yml`'s image matrix (`ghcr.io/smk762/argus-echo-<engine>`).
- [ ] **Docs**: `docs/<engine>.md` (model choice, licences, VRAM, settings), its column or section in docs/api.md,
      the README engine list, CLAUDE.md's Layout and any new "Must never happen" rows, and echo's row in
      argus-cortex's SUITE.md (a PR in the same release).
- [ ] **Check it live**: `argus-echo check http://127.0.0.1:<port>` passes for every capability it advertises.
