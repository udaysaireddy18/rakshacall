# RakshaCall — Family Voice Guard

**A local-first scam-call guard that checks whether the person on the call is really the relative they claim to be.**

Scammers call elderly parents pretending to be a son, daughter or uncle — sometimes using an AI copy of that
relative's voice — and ask for money "before telling anyone". RakshaCall learns your family's real voices, compares
the caller against them, reads the conversation for known scam scripts, and gives one plain-language verdict with
concrete next steps.

Everything runs in the browser. No backend, no account, no API keys, no model downloads.

---

## Why this project exists

Two failure modes are common in India and worldwide:

1. **Impersonation without AI** — a stranger simply says "Beta, it's me, I lost my phone, this is my new number."
   No technology is needed, only a convincing story.
2. **Voice cloning** — a short clip of a relative's voice is cloned and replayed down the phone.

Most consumer advice ("be careful") does not help at the moment of panic. This project puts a check *inside* the call:
does the voice match the person who enrolled, and does the conversation follow a known scam pattern?

---

## What it does

| Screen | What it does |
| --- | --- |
| **Guard** | Status overview, recent checks, four rules that stop most scams, setup checklist. |
| **Live call** | Listens through the microphone, compares the caller with an enrolled relative every ~3 s, scans the transcript for scam scripts, shows a live risk verdict with reasons and actions. One-tap verified callback and a "copy alert" for a guardian. |
| **Family Circle** | Records a 10-second enrolment per relative, checks sample quality, stores a voiceprint (numbers only, never audio), plus a family safe word and a private question. Lets you test a voice against the profile. |
| **Test Lab** | Upload a call recording (WAV/MP3/M4A/OGG/WebM) and compare it with an enrolled voice; paste any transcript and see which scam patterns it matches. |
| **Settings** | Sensitivity, speech-to-text language, sound alerts, local data export/import/delete, and a plain-language explanation of the algorithm and its limitations. |
| **Get APK / Install** | Install RakshaCall as a home-screen PWA, or download the Android preview APK built by the Pages workflow. |

Verdicts are three-state on purpose: **matches**, **not sure**, **does not match** — because pretending certainty is
dangerous in a safety product.

---

## Quick start

Requirements: **Node.js 18+** (tested on Node 24) and a browser with microphone access — Chrome or Edge recommended.

```bash
cd C:\Users\udays\OneDrive\Desktop\project\fraud_detector
npm install
npm run dev
```

Vite opens `http://localhost:5173`. Allow microphone access when asked.

On Windows you can also double-click **`start.bat`** — it installs dependencies on first run and starts the app.

Other commands:

```bash
npm run build      # production build into dist/
npm run preview    # serve the production build
npm run test:dsp   # DSP + scoring sanity suite (Node, no browser needed)
```

> The microphone only works on `localhost` or HTTPS. Opening the page through a LAN IP over plain HTTP will disable it
> (the app shows a banner when that happens).

---

## Install it on a phone

Open **Get APK** in the app for the install screen.

1. **Browser install (works today):** on Android use the browser menu → *Install app*; on iPhone use Safari → Share →
   *Add to Home Screen*. The app then opens full-screen and keeps working offline.
2. **Android APK:** the Pages workflow wraps the production build in Capacitor and publishes a debug-signed preview
   APK at `/downloads/RakshaCall.apk`. The Get APK screen turns into a direct download as soon as that file is present.

The web app ships a manifest and service worker, so Chrome treats it as installable. The published APK is a preview
build for direct sideloading; a Play Store release still needs a private signing key and a release build. The workflow
stores its preview-only signing key in the GitHub Actions cache so successive preview builds keep the same signing
identity. If that cache is ever evicted, the next build creates a new key, and an already-installed preview must be
uninstalled once before the new APK can be installed.

Once RakshaCall is running as an installed app, the **Get APK** navigation link and the top-bar APK shortcut are hidden
so an installed user is not asked to install the app again.

---

## Demo script (3–4 minutes, good for a viva)

1. **Open Family Circle → “Add family voice”.**
   Enter a name (e.g. *Ramesh*, relation *Father*), a safe word (e.g. `mango`), and a saved phone number.
   Record 10 seconds of a real person speaking normally. Show the quality badge, the **consistency** score
   (first half vs second half) and the automatically calibrated match line.
2. **Press “Test this voice”** and record 5 seconds of the same person. Show *“Sounds like Ramesh”* with the
   similarity breakdown (cepstral / spectral / pitch / timbre).
3. **Test with a different person** (a friend or your own voice). Show *“This does NOT sound like Ramesh”*.
   This is the core demonstration: same speaker vs different speaker.
4. Go to **Live call**, select *Ramesh*, press **Start listening**.
   - Speak as Ramesh → voice match bar high, risk stays low.
   - Speak as yourself → mismatch, risk rises, reasons explain why.
5. Open **Live transcript**. Either toggle *“Transcribe automatically”* (Chrome/Edge, sends audio to the browser's
   speech service) **or** type / paste the example scam line using **“Load example scam line”**.
   Show the script risk jump, the matched phrases, and the combined high-risk banner.
6. Show **“Open verification steps”**: safe word, private question, *Call Ramesh now* (uses the saved number),
   SMS check and copy-alert. Explain why out-of-band verification beats any detector.
7. Open **Test Lab**: upload any voice clip and compare; paste a normal family conversation to show a script score of 0.
8. Finish on **Settings → Honest limitations** and the privacy section.

If the room is noisy, use the Test Lab with recorded clips instead of a live microphone — it demonstrates the same
analysis pipeline.

---

## How it works

All audio is converted to **16 kHz mono** and processed in memory.

```
microphone / file
      │
      ▼
16 kHz mono PCM
      │
      ▼
frames: 32 ms window, 10 ms hop
      │
      ├── energy + ZCR → adaptive voice-activity detection (silence removed)
      │
      ├── pre-emphasis (0.97) → Hamming → FFT (512)
      │        ├── mel filterbank (26 bands, 80 Hz–7.7 kHz) → log → DCT-II
      │        │        └── 12 MFCCs per frame, cepstral-mean normalised
      │        ├── spectral centroid, spectral flatness, HF energy ratio, spectral flux
      │        └── harmonic-to-noise proxy
      │
      └── normalised autocorrelation → F0 (70–400 Hz)
      │
      ▼
utterance summary ("voiceprint", ~30 numbers)
  mean + spread of the 12 MFCCs, median pitch and pitch spread,
  centroid / flatness / HNR / ZCR statistics, speech ratio
      │
      ▼
speaker similarity (0–1)
  0.62 × cosine(MFCC means)
+ 0.16 × cosine(MFCC spreads)
+ 0.12 × pitch similarity (semitones)
+ 0.10 × timbre similarity (spectral centroid)
      │
      ▼
per-profile thresholds, calibrated at enrolment
  selfSimilarity  = similarity(first half, second half of the enrolment)
  match line      = clamp(self − 0.07, 0.66, 0.88)
  uncertain line  = match − 0.08
      │
      ▼
risk fusion (0–100)
  identity 55%  +  scam script 30%  +  audio artifacts 15%
  (script 68% + artifacts 32% when no enrolled voice is selected)
  + context flags: new number, money request, urgency
      │
      ▼
verdict + human-readable reasons + actions
```

**Scam-script detection** uses weighted phrase categories — secrecy, money, fake authority, isolation, "new number"
identity claims, OTP/credential requests, urgency, emergency stories and unusual payment rails (gift cards, crypto) —
in English, Hinglish and Hindi. Combinations are weighted much more heavily than single phrases:

- "send money" **and** "don't tell anyone"
- "CBI / police" **and** a payment request
- "stay on the line" **and** a payment request
- OTP request **and** urgency/authority

This is deliberately a **co-equal signal**, because many scams use no AI voice at all.

**Audio-artifact cues** (spectral flatness, harmonicity, pitch flatness, spectral flux) are computed honestly but shown
as *experimental*. They are weak evidence and are never the only reason for a verdict.

---

## Project structure

```
fraud_detector/
├── index.html
├── package.json
├── vite.config.js
├── start.bat                  # one-click Windows launcher
├── public/
│   ├── favicon.svg
│   ├── manifest.webmanifest    # installable web app metadata
│   ├── sw.js                   # offline shell cache
│   ├── icons/                  # home-screen and maskable icons
│   └── downloads/              # preview APK is generated during Pages deployment
├── scripts/
│   └── test-dsp.mjs           # Node sanity suite for the whole pipeline
└── src/
    ├── main.jsx
    ├── App.jsx                # hash router, state, persistence, toasts
    ├── styles.css             # complete design system (no CSS framework)
    ├── components/
    │   └── ui.jsx             # card, badge, score bar, modal, waveform, level meter
    ├── lib/
    │   ├── dsp.js             # FFT, mel, MFCC, pitch, VAD, summary (pure JS, Node-safe)
    │   ├── voiceprint.js      # enrolment, similarity, calibration, artifact heuristic
    │   ├── risk.js            # risk fusion, bands, reasons, advice
    │   ├── scamPhrases.js     # phrase banks, scoring, example scripts
    │   ├── audio.js           # mic capture, resampling, file decode, Web Speech, alarm
    │   ├── storage.js         # localStorage, backup/restore
    │   └── format.js          # dates, phone links, labels
    └── screens/
        ├── GuardScreen.jsx
        ├── LiveCallScreen.jsx
        ├── FamilyScreen.jsx
        ├── LabScreen.jsx
        ├── InstallScreen.jsx
        └── SettingsScreen.jsx
```

Dependencies: **React 18**, **React DOM 18**, **Vite 5**. Nothing else — no chart library, no icon package, no router,
no ML runtime.

---

## Privacy and data

- **Voice matching is fully local.** Audio is processed in memory and discarded. Only about 30 numbers per person are
  saved in `localStorage` (`rakshacall.profiles.v1`).
- **No backend, no account, no analytics, no network calls** in the voice pipeline.
- **One exception, off by default:** *live speech transcription*. If you turn it on, the browser's own speech service
  handles that audio (Chrome/Edge send it to Google). For a fully offline check, leave it off and type the caller's
  words into the transcript box.
- **Backups** (Settings → Download) contain voiceprint templates, which are biometric data. Treat them like a password.
- **Delete everything** with Settings → *Delete all local data*, or clear site data in the browser.

---

## Honest limitations

This is a strong student/portfolio prototype, not a certified security product. Please read these before trusting it.

1. **It is classical speaker verification, not a trained deepfake detector.** It answers "does this voice match the
   enrolled person?" using MFCC statistics, pitch and timbre. It cannot prove that a voice is synthetic.
2. **A good clone can pass.** Modern neural cloning needs only a few seconds of reference audio. If the clone is
   convincing, the voice score may be high. That is exactly why the app always pushes a callback on a saved number and
   a family safe word — those cannot be cloned.
3. **Short or noisy calls reduce accuracy.** Two seconds in traffic is not enough. The app says "no clear speech" or
   "not sure" rather than guessing.
4. **Narrowband phone audio removes high-frequency cues.** When the call is routed through a narrowband path, the
   artifact score becomes weaker (the app says so in the result).
5. **Thresholds are personal.** Each profile calibrates from its own enrolment consistency. Sensitivity can be set to
   Strict for elderly users — more warnings, fewer missed impersonations.
6. **A real relative under pressure can look like a scam.** If the voice matches but the script is a scam script, the
   app still raises the risk and tells you to verify. Sometimes that is the right call.
7. **No benchmarked equal-error rate.** The Node test suite uses synthetic vowel-like signals to prove the pipeline and
   the scoring direction (same speaker > different speaker). Real-world accuracy depends on microphones, languages,
   accents and call quality. Test it with your own family before relying on it.
8. **Not a substitute for reporting.** If money was sent, contact the bank and report at **cybercrime.gov.in** or
   **1930** (India) immediately.

---

## Testing

```bash
npm run test:dsp
```

The suite synthesises vowel-like voices (jittered pulse train through three formants, syllable envelope, noise) and
checks:

- frames, MFCC length, finite features, pitch in range, VAD;
- same speaker scores higher than different male/female speakers;
- enrolment creates ordered thresholds, and verification accepts the same speaker and rejects another;
- scam scripts score 100 while a normal family call scores 0;
- risk fusion marks impersonation as high risk, a normal call as low, and "matched voice + scam script" as not-low;
- every reason is human-readable and advice is present.

Expected output ends with `ALL CHECKS PASSED`.

For a browser-level check, `npm run build` must complete, then open each route (`#/guard`, `#/call`, `#/family`,
`#/lab`, `#/install`, `#/settings`) and confirm there are no console errors. The layout is full-width: a sticky
top navigation bar on desktop becomes a compact top bar plus bottom tab bar on phones.

---

## Deployment

Every push to `main` builds and publishes the app through GitHub Actions Pages. A Vercel HTTPS mirror is also
live. See [DEPLOYMENT.md](./DEPLOYMENT.md) for live URLs, the custom-domain DNS record, and the current HTTPS
status.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Microphone does not start | Use `http://localhost:5173`, not a LAN IP. Allow mic permission in the address bar. Close other apps that hold the mic. |
| "Live transcription unavailable" | Firefox/Safari lack the Web Speech API. Use Chrome/Edge, or type the transcript manually. |
| Enrolment quality is "poor" | Record again in a quiet room, 10 full seconds, normal speaking voice, phone 15–20 cm away. |
| Everything sounds like "not sure" | Set sensitivity to **Relaxed**, or re-enrol with a cleaner sample. Check that the right person is selected. |
| Voice changes after a cold/illness | Re-enrol that person; store the new sample. |
| Data disappeared | The app stores data per browser and per origin. Clearing site data, private windows, or changing ports (`5173` → another) creates a fresh store. Use backup/restore to move data. |

---

## Possible next steps

- Replace the statistical voiceprint with an on-device embedding model (e.g. ECAPA-TDNN via ONNX Runtime Web) while
  keeping the same UI and the explainable fallback.
- Add a Hindi/regional-language UI and native-speaker phrase banks.
- Add a companion mode: the relative receives a push/SMS "was this you?" challenge with a one-time code.
- Add native call-audio capture to the Capacitor wrapper instead of speakerphone.
- Calibrate on a small consented dataset and report EER / FAR / FRR.
- Add a "family guardian" role with signed, encrypted profile sharing.

---

## Renaming

The product name lives in `index.html`, `src/App.jsx` (brand block and footer), and the `title`/meta description.
Storage keys are prefixed `rakshacall.` — change them only if you do not mind losing existing local data.

---

Built as a practical response to a real problem: the person most likely to be hurt by a voice-cloning scam is the one
least likely to spot it. Verify out-of-band. Always.
