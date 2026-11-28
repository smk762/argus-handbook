# Qwen3-TTS engine

[Qwen3-TTS](https://huggingface.co/Qwen) (12 Hz, 0.6B or 1.7B) loads two models: **Base**, which clones a voice
from one reference clip, and **CustomVoice**, which has built-in speakers that a delivery `instruction` or a
`voice_description` steers (1.7B only: qwen-tts ignores instructions on 0.6B). 10 languages. The 0.6B pair fits an
8 GB card.

Source: [engines/qwen/tts_server.py](../engines/qwen/tts_server.py). Contract: [api.md](api.md). Published on
`8142` by `compose.yaml` (`--profile qwen`). The weights are Apache-2.0 and are baked into the image at build
time (`QWEN_MODEL_SIZE`).

Differences from the other engines:

- `/synthesise/stream` streams one sentence at a time: the text is split at `.`, `!`, `?`, `…`, CJK full stops
  and blank lines (fragments under 24 characters join a neighbour), and each sentence's PCM is sent as soon as it
  is rendered. The first byte comes after the first sentence, not within it as on Miso and XTTS. The first
  sentence is rendered before the `200`, so its errors are JSON errors; a later failure ends the stream early.
  One model lease covers the whole stream. When the client disconnects no further sentence starts; the one in
  progress finishes (generation can't be interrupted) and then releases the lease. Sentences are rendered
  independently, so prosody does not carry across a sentence boundary.
- `/clone-voice` takes one `audio` clip (3 s or more). With `reference_text` the clone uses in-context learning
  (the clip's codec tokens plus its transcript); without it, only the speaker embedding (x-vector). It refuses
  to overwrite an existing clone unless `replace=true` (`409`), and writes a `meta.json` (`voice_name` sets its
  `name`).
- `voice_description`, `instruction` and `emotion` steer a built-in CustomVoice speaker; the other engines ignore
  them. A `voice_description` is not a new voice: it is the instruction given to a speaker (`speaker`, else
  `QWEN_DEFAULT_SPEAKER`, else the first one `/speakers` lists), combined with any `instruction` or `emotion`.
  Only the 1.7B CustomVoice model applies instructions. On 0.6B, qwen-tts drops them: a `voice_description` is a
  `422` rather than a silently unchanged voice, while `instruction` and `emotion` are accepted and have no effect.
  True voice design needs qwen-tts's separate VoiceDesign model (1.7B only), which echo doesn't load (#31).
- `speed` is accepted and ignored.
- `seed` seeds `/synthesise` once; `/synthesise/stream` seeds sentence *i* (from 0) with `seed + i`, so each
  sentence is reproducible on its own. See [api.md#reproducibility](api.md#reproducibility).

## Clones

`GET /clones`, `GET /clones/{companion_id}/download`, `DELETE /clones/{companion_id}` and `POST /clones/import`
behave as on XTTS (see [miso-api.md](miso-api.md#get-clones) for the shapes), with these Qwen specifics:

- A stored Qwen `prompt.pt` is qwen-tts's `create_voice_clone_prompt` result: a one-item list of
  `VoiceClonePromptItem` (speaker embedding, and for ICL clones the reference codec tokens and transcript). Only
  this server writes it, and it is loaded with `torch.load(weights_only=True)` with only that class allowed.
- The download archive carries the item as `prompt.safetensors`: `ref_spk_embedding` (float32) and, for an ICL
  clone, `ref_code` (int64) as tensors, with `x_vector_only_mode`, `icl_mode`, `ref_text` and the embedding's own
  dtype (`ref_spk_embedding_dtype`, so a bfloat16 embedding comes back as bfloat16) as safetensors metadata.
  Parsing it never runs code.
- `GET /clones` lists every `voice_clones/<id>/prompt.pt`. Clones made before Qwen wrote `meta.json` are listed
  from the prompt alone (`name` = id, `created_at` = upload time), and their download carries a generated
  `meta.json`. Every `meta.json` Qwen writes has `"engine": "qwen-tts"`.
- `POST /clones/import` accepts only a Qwen clone: `422` if the archive's `meta.json` or prompt metadata names
  another engine, or if its `prompt.safetensors` doesn't make one valid `VoiceClonePromptItem` (a Miso or XTTS
  prompt has other tensors and fails). An archive with only a pickled `prompt.pt` (a download from before this
  version) is refused unread, since unpickling an upload can run code: re-export it from a current Qwen engine.
  The prompt is re-serialised from the validated fields. `409` if the id is taken and `replace` is not
  `true`; `413` over 17 MiB.

## POST /analyze-clips

Ranks candidate reference clips so a client can pick the one to clone from (Qwen clones from a single clip, so
use the first index in `order`). The response has the XTTS shape (`clips`, `order`, `threshold`,
`gpt_cond_len`) plus `"engine": "qwen-tts"`. How it differs from XTTS:

- **Quality** is engine-independent: clipping, peak, and speech seconds and SNR from an energy gate on 30 ms
  frames (numpy, no Silero VAD). A frame is speech when it is 10 dB over the clip's noise floor and within 35 dB
  of its loud frames; a clip with no pauses counts as all speech, with `snr_db: null`. Clips are decoded with
  libsndfile (WAV, FLAC, OGG, and MP3 where libsndfile supports it); anything else is flagged `unreadable:…`.
- **Consistency** compares Qwen's own speaker embeddings (the x-vector `create_voice_clone_prompt` computes, from
  at most the first 30 s of each clip), so a clip of another voice, room or microphone is flagged `outlier`.
  It needs the Base model: `503` without it.
- `very_short` flags under 3 s of speech (the `/clone-voice` minimum). `gpt_cond_len` is reported as `15`, the
  speech length that counts fully towards a clip's rank; Qwen has no conditioning window.

## Settings

| Variable | Default | Effect |
| --- | --- | --- |
| `TTS_MODEL_SIZE` | `0.6b` | `0.6b` or `1.7b` (compose: `QWEN_MODEL_SIZE`, also the image build arg) |
| `TTS_DEVICE` | `cuda:0` | `cuda:N` or `cpu` |
| `TTS_LOAD_MODELS` | `both` | `both`, `custom_voice` or `base` (compose: `QWEN_LOAD_MODELS`) |
| `TTS_DEFAULT_SPEAKER` | empty | Speaker for requests that name none (compose: `QWEN_DEFAULT_SPEAKER`) |
| `TTS_PRELOAD` | `0` | `1` loads at startup |
| `TTS_KEEP_ALIVE_GPU` | `120` | Idle seconds on the GPU before moving to CPU. `-1` = never, `0` = at once |
| `TTS_KEEP_ALIVE_CPU` | `600` | Idle seconds on CPU before unloading. `-1` = never, `0` = at once |
| `TTS_MAX_NEW_TOKENS` | `0` | Codec-token cap per utterance; `0` sizes it from the text (4 per character + 64), so a sample that misses its end token cannot run on for minutes |
| `TTS_MAX_NEW_TOKENS_CEILING` | `1024` | Upper bound on that automatic cap (about 85 s at 12 Hz) |
| `TTS_MAX_CLIPS` | `16` | Most clips per `/analyze-clips`; more is `413` |
| `TTS_CLIP_MAX_BYTES` | `16777216` | Largest clip for `/clone-voice` and `/analyze-clips` (16 MiB); larger is `413` |
| `TTS_ANALYZE_THRESHOLD` | `60` | `/analyze-clips` score below which a clip is not recommended |
| `TTS_CHECKPOINT_ROOT` | empty | Directory of fine-tuned checkpoints `POST /admin/load` may load; empty, the route answers `503`. Compose sets `/checkpoints` and mounts the host's `QWEN_CHECKPOINT_ROOT` (default `./checkpoints/qwen`) there read-only. See [below](#fine-tuned-checkpoints) |
| `ECHO_VERSION`, `ECHO_REVISION` | empty | The release and git commit, set at image build time (build args); `/health` reports them as `image` |
| `ARGUS_ADMIN_TOKEN`, `ARGUS_ADMIN_INSECURE` | empty | See [api.md#security](api.md#security) |

Storage is S3 only: `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` (compose:
`QWEN_S3_BUCKET`, default `voice-qwen`) and `S3_PUBLIC_URL` (compose: `QWEN_S3_PUBLIC_URL`). The bucket must exist.
`S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` have no default: the server refuses to start without both, and
likewise when `S3_ENDPOINT_URL` is not an http(s) URL (an empty one used to fail each `/synthesise` after
rendering) or `S3_BUCKET_NAME` is empty.

## Fine-tuned checkpoints

`POST /admin/load {"checkpoint": "<name>"}` loads a fine-tune from `TTS_CHECKPOINT_ROOT/<name>`; `/admin/unload`
goes back to stock. Statuses, what happens to requests meanwhile, and how long a checkpoint stays selected:
[api.md](api.md#fine-tuned-checkpoints).

A checkpoint is a Hugging Face model directory that `Qwen3TTSModel.from_pretrained` loads, as the Qwen3-TTS
fine-tuning scripts write it (a copy of the model they started from, with the trained weights and `config.json`
written over it):

| File | Required | What |
| --- | --- | --- |
| `config.json` | yes | `"model_type": "qwen3_tts"`, and `tts_model_type` `base` or `custom_voice` (which model it replaces, below). `voice_design` is refused: this engine doesn't serve that model |
| `model.safetensors` or `model.safetensors.index.json` (+ shards) | yes | The weights |
| `generation_config.json` | yes | Sampling defaults (`from_pretrained` reads it) |
| `tokenizer_config.json` and the tokenizer files it names (`vocab.json`, `merges.txt`, ...) | yes | The text tokenizer the processor loads |
| `speech_tokenizer/` (`config.json`, weights) | yes | The 12 Hz codec (`from_pretrained` loads it from here) |

The checkpoint replaces the model of its `tts_model_type`: a `custom_voice` fine-tune (a new built-in speaker, used
with `speaker`) replaces CustomVoice, a `base` one replaces Base (cloning). The other model loads stock as
`TTS_LOAD_MODELS` says; the checkpoint's own model loads whatever `TTS_LOAD_MODELS` is. The checkpoint loads onto
`TTS_DEVICE` with SDPA attention in bfloat16, as the stock models do.

`/health` `weights.files` lists the sha256 of every file at the top of each loaded model's directory and in its
`speech_tokenizer/` (dotfiles skipped), prefixed with the slot: `custom_voice/model.safetensors`,
`base/speech_tokenizer/model.safetensors`, and so on. Both slots are listed, the stock one included, so the whole
loaded state is pinned. The stock files are read from the Hugging Face cache the image baked. `weights.models` gives each slot's checkpoint and fingerprint; `/synthesise` (`model`, `checkpoint`, `weights_fingerprint`) and `/synthesise/stream` (`X-Echo-Model`, `X-Echo-Checkpoint`, `X-Echo-Weights`) report the slot that spoke each utterance and its fingerprint. See [api.md#weights-fingerprint](api.md#weights-fingerprint).

## Home Assistant

`--profile wyoming-qwen` puts Qwen behind the Wyoming TTS bridge on `10242`. Qwen renders the whole clip before
sending any of it, so the first audio arrives only when the utterance is done. Details:
[voice-cloning.md#home-assistant](voice-cloning.md#home-assistant).
