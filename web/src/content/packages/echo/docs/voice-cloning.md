# Voice cloning: getting the best results

**Clone on XTTS-v2.** It is the suite's cloning engine (argus-echo#51): consumers that clone (argus-mask,
argus-proof's speech grids) use echo's XTTS, and fine-tunes go through argus-forge's XTTS-v2 path. It has the most
built-in speakers (58, each in any of its 17 languages), averages several reference clips, and is the smallest
engine (about 2 GB). Its weights are under the Coqui Public Model Licence, which is **non-commercial**: so are
clones and fine-tunes made with it. If that matters, Qwen3-TTS (Apache-2.0) is the fallback. Miso and Qwen can
still clone, as below, but they are outside the suite's cloning path.

The engines clone differently, so the best reference differs per engine. argus-mask's
[voices guide](https://github.com/smk762/argus-mask/blob/dev/docs/voices.md) covers recording, synthetic voices
and consent in depth; this page is what each engine does with what you send.

| | **XTTS-v2** | **Miso** | **Qwen3-TTS** |
|---|---|---|---|
| Strategy | Averages a speaker embedding across clips | One-shot: conditions on one reference | One-shot (Base model) |
| Ideal input | 3–8 clips of 3–10 s, 6–60 s in total | **One** clean, expressive 6–15 s clip | One clean clip |
| More clips help? | Yes, up to the conditioning window | No: the best-scoring clip is used | Takes one clip |
| Transcript (`reference_text`) | Optional | **Needed**: a wrong or missing one degrades the clone. Without one, Miso transcribes the clips if `MISO_STT_URL` is set | Recommended |
| Strength | Robust, noise-averaged timbre | Expressive prosody and emotion | Voice design and delivery instructions on the built-in speakers |

## Recording, for every engine

- **Clean signal.** A quiet room with no music or TV and little reverb. A close mic (15–30 cm) beats a distant one.
- **One speaker.** No overlapping voices or background chatter.
- **Natural, expressive delivery.** Speak the way the clone should sound: monotone in, monotone out.
- **Consistent capture.** Same mic, distance and room across clips.
- **Good level, no clipping.** Well above the noise floor, but with no distorted peaks.
- **Format.** WAV or FLAC preferred; MP3 and M4A work. Any sample rate; stereo is downmixed.

## XTTS-v2

- Send several short clips with **different sentences** but the same voice and capture conditions: varied words
  cover more phonemes, and identical conditions average cleanly.
- Call `POST /analyze-clips` first. It scores each clip (SNR, clipping, seconds of speech, consistency with the
  rest of the set), leaves out low scorers, and orders the rest best first, which is the order that fills the
  conditioning window (`XTTS_GPT_COND_LEN`, 30 s).
- Each clip is standardised before the latents are computed: mono, resample, high-pass, VAD trim, denoise when
  the SNR is low, loudness normalisation. `/clone-voice` returns a report per clip.
  A clip with no detected speech (or under 0.5 s of it) is left out and reported as `skipped_no_speech`; if none is
  left, the answer is `422`.

## Miso

- **Miso has no usable built-in voices.** Speakers `0` and `1` are conversation turns, not personas: without a
  clone the voice is improvised and different on every request. Clone a voice for anything you keep.
- Send **one** clip of clean, expressive speech. There is no averaging to hide a bad take.
- Send its transcript as `reference_text`. Miso aligns the clone to it.
- Pick a clip with the prosody you want (warmth, energy, pace); Miso copies emotion well.
- You can still send several clips: they are scored and the best one is used.
- Trim long silences at the start and end. Miso keeps the first 20 s (`MISO_REF_MAX_SECONDS`).
- Miso has no tone or emotion setting; `voice_description`, `instruction` and `emotion` are ignored.

## Qwen3-TTS

- `/clone-voice` takes one clip and stores the Base model's prompt.
- For a voice that doesn't exist, steer a CustomVoice speaker with a `voice_description` or an `instruction` (1.7B
  model only) instead of cloning.

## After cloning

- A clone lives at `voice_clones/<companion_id>/` on the engine that made it (`prompt.pt` and `meta.json`), and is
  used by passing `voice_clone_id`. **Clones don't move between engines**: each engine's `prompt.pt` is its own
  format.
- On every engine, `GET /clones/<id>/download` backs a clone up as a zip and `POST /clones/import` restores it to
  the same engine. The archive carries the prompt as `prompt.safetensors`; import refuses older archives that hold
  a `prompt.pt` (unpickling an upload can run code), so re-download a clone from a current engine before moving
  it. See [miso-api.md](miso-api.md#get-clonescompanion_iddownload).
- Clone a real person's voice only with their consent; see [api.md#security](api.md#security).

## Home Assistant

The Wyoming bridges (one CPU image, [engines/wyoming/](../engines/wyoming/)) put echo's engines in Home Assistant's
voice pipeline. Each is a Compose profile; run it next to its engine (or point its `WYOMING_*_ENGINE_URL` at an
engine on another host) and add it under **Settings → Devices & Services → Wyoming Protocol** with this host's
address and the port:

| Profile | Port | Serves | Forwards to |
| --- | --- | --- | --- |
| `wyoming-xtts` | `10240` | text to speech (`tts`) | XTTS `POST /synthesise/stream` |
| `wyoming-miso` | `10241` | text to speech (`tts`) | Miso `POST /synthesise/stream` |
| `wyoming-qwen` | `10242` | text to speech (`tts`) | Qwen `POST /synthesise/stream` |
| `wyoming-whisper` | `10243` | speech to text (`asr`) | Whisper `POST /transcribe` |

- **Text to speech** advertises the engine's default speaker and, on XTTS and Miso, each stored clone as
  `clone:<companion_id>`. Audio is streamed at the engine's `X-Sample-Rate`.
- **Qwen sends its audio as one chunk at the end**: it renders the whole clip first, so the first audio arrives
  only when the utterance is done, where XTTS and Miso start within a sentence. Qwen has no `GET /clones`, so the
  bridge offers one built-in speaker, `WYOMING_QWEN_SPEAKER` (default `ryan`).
- **Speech to text** buffers each utterance from `AudioStart` to `AudioStop` (Home Assistant does the endpointing),
  converts it to 16 kHz mono 16-bit, and posts one WAV to `/transcribe` with the language from the pipeline
  (`en-US` becomes `en`; one Whisper lacks, or none, means detect; `WYOMING_WHISPER_LANGUAGE` sets a default).
  A failure (engine down, busy, a rejected clip) is logged by the bridge and answered with an empty transcript.
  Utterances are capped at 300 s (`WYOMING_ASR_MAX_SECONDS`), and the bridge waits up to
  `WYOMING_WHISPER_TIMEOUT` (120 s) for the transcript, which covers loading the model on first use.
