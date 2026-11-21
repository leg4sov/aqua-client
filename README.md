<div align="center">

# Aqua

### A lightweight AI study panel for Moodle

**Ask questions. Review learning material. Stay in control.**

Aqua is a Manifest V3 browser extension that helps you review Moodle questions and selected text with Google's Gemini API — or, optionally, with a local AI running on your own computer without internet. It only runs when you activate it, and it never submits answers or interacts with Moodle forms.

<br>

[Features](#features) · [Installation](#installation) · [Configuration](#configure-gemini) · [Local AI](#local-ai-offline-optional) · [Usage](#how-to-use-aqua) · [Privacy](#privacy--security) · [Troubleshooting](#troubleshooting)

<br>

![Firefox](https://img.shields.io/badge/Firefox-Primary-FF7139?logo=firefox-browser&logoColor=white)
![Chrome](https://img.shields.io/badge/Chrome%2FChromium-Secondary-4285F4?logo=googlechrome&logoColor=white)
![Version](https://img.shields.io/badge/version-0.12.0-0ea5e9)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-64748b)
![Local AI](https://img.shields.io/badge/Local%20AI-optional-10b981)
![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)

</div>

---

## Features

- **On-demand panel** — Aqua does nothing until you open it with a keyboard shortcut or the extension popup.
- **Three answer modes** — **Quiz** shows only the question number and option letter(s); **Text** gives a written answer (short or long, chosen inside the mode); **Image** answers a question from a screenshot you paste, for unusual question types (ordering, fill in the blanks…).
- **Moodle question detection** — extracts supported questions from Moodle pages, or lets you ask about text you select yourself.
- **Gemini API integration** — use your own Google AI Studio API key and choose the model in settings.
- **Optional local AI (offline)** — answer with a model running on your own computer (llama.cpp + Qwen3.5 4B), no internet or API key needed; switch with **Alt+Shift+Q**. Ready-made scripts in [`local-ai/`](local-ai/) also run it from a USB drive.
- **Optional reference PDFs** — add your own text-based PDFs; Aqua searches them locally and adds the most relevant excerpts to the request as reference (disabled by default).
- **Optional web references** — paste up to 5 links; Gemini reads those pages itself and gives them priority; optional internet search only if the links have no answer (off by default).
- **Optional Auto mode (+ key)** — off by default. With the panel open, pressing **+** ticks the suggested answer of the next unanswered multiple-choice question, one question per press. See [Auto mode](#auto-mode-optional).
- **Privacy-conscious processing** — sends only the selected question or text (plus any PDF excerpts you can see), not the entire page; attempts to redact common sensitive values before sending.
- **Uncertainty labels** — results can be labelled **Hypothesis** or **Insufficient data** when the model is not sure.
- **Customisable panel** — choose a colour palette, size (down to ultra-small), opacity, background and position.
- **Visibility modes** — show the panel only while the mouse is over it, fade it out after inactivity, or combine both.
- **English and Spanish interface** — English by default, with Spanish available in settings.
- **Keyboard shortcuts** — open and hide the panel, or move it left or right, without reaching for the toolbar.
- **Brightness popup and quick settings** — the toolbar icon opens a browser-brightness slider; the 💧 button next to the name opens a compact menu for the API key, connection test, palette, size and visibility.
- **Optional access password** — a simple password (once per browser session) protects the settings pages, the quick-settings menu and the panel; the brightness slider stays free. See [Access password](#access-password-optional).
- **Automated tests** — cover core logic, PDF reading and search, error handling, validation, cancellation and extension-manifest checks.

> **Use Aqua responsibly.** It is intended for practice quizzes, revision pages and study materials. By default it does not fill in or submit Moodle forms; the optional [Auto mode](#auto-mode-optional) ticks one answer per key press and never submits. If you use it during an active quiz, confirm that AI assistance is permitted by your instructor. Do not use it for graded assessments where assistance is prohibited.

## What's new in 0.17.2

- **Matching questions** (dropdowns whose first option "Choose..." has value `0`, as in real Moodle) are now detected and filled by Auto. Before, Aqua treated that placeholder as a real option.
- **Ordering questions:** the list is found even if it is outside `.answer` or in a different wrapper; the hidden field is matched more tolerantly.

## What's new in 0.17.1 (and 0.17.0)

- **Auto now also fills essay (development) questions** with a short answer (only in empty fields) **and orders "put in order" questions** (lists of bars/boxes, top to bottom or as the statement says). **Short-answer, numerical and typed-gap (cloze) questions are filled too**, one per press, only in empty boxes (a numeric box gets just the number). Ordering is done once per question, by reordering the list and its hidden field; it follows Moodle's ordering-plugin structure, so check it on your real quiz.
- **Practice quiz** (`testkit/cuestionario-practica-aqua.html`): two new draggable ordering questions (13 and 14).
- **Settings tidied:** the order is now API key, Model + Local AI (one tab), Documents + Web references (one tab), Shortcuts/Auto, Appearance, Language, Privacy. Same options and look.

## What's new in 0.16.0

- **Web links are safer:** links to internal networks/hosts (`.local`, `.corp`, 100.64.x…) or with secrets in the URL (`access_token`, `sesskey`…) are rejected. If the model answers badly while web tools are on, Aqua retries once without them (the panel says so) instead of failing. A quota/timeout error with links on now hints to reduce links or turn them off.
- **Ultra-small size:** when Auto is on it shows only a tiny `auto: on` tag.
- **Settings reordered** (same options, same look): language, key, model, local AI, docs, web, shortcuts/Auto, appearance, privacy; in Appearance, size/side/background come first.

## What's new in 0.15.0

- **Auto mode goes strictly in page order**, from the first unanswered question down (it no longer jumps to the one after your last answer and then back to the top).
- **Backup API key (optional):** in **Settings → API key** you can add a second key. If the main key runs out of its limit (quota) or is rejected, Aqua tries the backup automatically, keeps using it for about 10 minutes before trying the main one again, and tells you in the panel when the backup answered. Other errors (server, network, timeout) do not switch keys. **Google applies the limits per project, not per key:** a second key from the same project shares the quota and does not help; use a key from another project or a paid one, and check Google's terms before creating several free accounts or projects just to bypass the limits. Both keys are stored locally, like the main one.

## What's new in 0.14.0

- **Auto mode now also fills dropdown questions** (matching, and gaps filled from a list). Aqua numbers the dropdowns, asks the model for one option per gap and selects it only in gaps that are still empty. Text-box questions (short answer, numerical, essay, typed gaps) are still left for you.

## What's new in 0.13.0

- **Auto mode (optional, off by default):** turn it on in **Settings → Keyboard shortcuts**. With the panel open, pressing **+** (outside text fields) asks the model about the next unanswered multiple-choice question and ticks the suggested option. See [Auto mode](#auto-mode-optional).

## What's new in 0.12.0

- **Access password (once per browser session):** the settings page, the quick-settings menu in the popup and the panel's controls stay locked until the password is typed. Typing it in any of them unlocks the others. Closing the browser or reloading the extension locks it again. The brightness slider and hiding the panel are never locked.
- Version bump for a new upload; no change in permissions. The manifest has no maximum Firefox version, so it keeps loading on newer releases (Firefox 160 at the time of writing).

## What's new in 0.11.0 (v11)

- **Local AI mode (offline, optional):** answer with a model on your own computer (llama.cpp + Qwen3.5 4B) instead of Gemini. Switch with **Alt+Shift+Q**; a tiny "Local" / "Online" text confirms the change without opening the panel.
- **New `local-ai/` folder:** scripts to download the AI once and start it on Windows or Linux, visible or hidden, even from a USB drive and with no internet.
- New **Local AI** tab in the settings (server address, model, timeout, localhost permission, connection test).
- The API key field now says *Paste your own Gemini key here*; no key is included in the project.
- README rewritten with installation steps for any operating system.

## Project status

Aqua's automated tests cover key components, but **the extension has not yet been verified end-to-end in a real browser or with a live Gemini API key**. Treat it as a version to test locally, not as a fully validated production release.

| Area | Status |
|---|---|
| Core logic, simulated Gemini client, request service and panel tests | Automated tests available |
| PDF reading, indexing and search | Automated tests with the real pdf.js library in Node and a simulated IndexedDB; not yet verified in a real browser |
| Firefox manifest | Checked with `web-ext lint`; no errors reported, plus warnings about Firefox for Android and about dynamic `import()` calls inside the bundled pdf.js |
| Settings page layout and the new icon | CSS syntax checked and icon rendered at all sizes; not yet viewed in a real browser |
| Access password (settings page, popup, panel, background) | Automated tests with simulated browser APIs; not yet verified in a real browser |
| Firefox installation and real Moodle pages | Not yet manually verified |
| Chrome/Chromium installation | Not yet manually verified |
| Live Gemini API requests | Not yet verified with a real API key |
| Shortcuts, `activeTab` injection and Shadow DOM on a live Moodle site | Not yet manually verified |
| Local AI client (requests, errors, thinking-tag removal, switch) | Automated tests with a simulated server |
| Local AI scripts (`local-ai/`) | Linux: download and server start-up verified with llama.cpp b12359 and Qwen3.5 4B. Windows scripts not yet tested. Extension ↔ real local server not yet verified end-to-end |

## Compatibility

- **Primary browser:** Firefox 140 or newer (no upper limit set, so newer releases such as Firefox 160 load it), using the Firefox Manifest V3 configuration (`manifest.json`).
- **Secondary browser:** Chrome / Chromium 102 or newer, using the Chrome Manifest V3 configuration (`manifest.chrome.json`).
- **Development requirements:** Node.js 20 or newer and npm.
- **Operating system:** any system that runs Firefox or Chrome (Windows, macOS, Linux). Building needs Node.js; the optional local AI runs on Windows x64 and Linux x64 (CPU only, ~16 GB RAM recommended).

Build outputs are generated in `dist/firefox` and `dist/chrome`.

## Installation

### 1. Install the development tools

You need **Git** and **Node.js 20 or newer** (npm comes with it).

| System | How to install |
|---|---|
| Windows | Download the installers from [git-scm.com](https://git-scm.com/) and [nodejs.org](https://nodejs.org/) (LTS), or run `winget install Git.Git OpenJS.NodeJS.LTS` |
| macOS | `brew install git node` ([Homebrew](https://brew.sh/)) or the installer from [nodejs.org](https://nodejs.org/) |
| Linux | Install `git`, `nodejs` and `npm` with your distribution's package manager. If it ships a Node older than 20, use [nodejs.org](https://nodejs.org/) or [nvm](https://github.com/nvm-sh/nvm) |

Check the versions:

```bash
node --version   # must be v20 or newer
npm --version
```

### 2. Get the source and build Aqua

If you have not cloned the repository yet:

```bash
git clone https://github.com/leg4sov/aqua-client.git
cd aqua-client
```

If you already have the repository, enter its directory instead. Then run:

```bash
npm install
npm test
npm run build
```

The build creates:

- `dist/firefox` — Firefox extension
- `dist/chrome` — Chrome / Chromium extension

The build only copies files; it does not minify or transform Aqua's code. The bundled pdf.js library (`vendor/pdfjs`) is included unmodified.

### 3. Load the extension

<details>
<summary><strong>Firefox (recommended)</strong></summary>

**Quick launch for development:**

```bash
npm run start:firefox
```

This opens Firefox with Aqua loaded in a temporary profile.

**Load it manually:**

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `dist/firefox/manifest.json`.
4. Open Aqua's settings and grant API access if the **Grant access** button appears.

A temporary add-on is removed when that Firefox session closes. To keep Aqua installed, sign it through Mozilla Add-ons as an **unlisted** extension, or use Firefox Developer Edition / Nightly with the appropriate unsigned-extension setting.

</details>

<details>
<summary><strong>Chrome / Chromium</strong></summary>

1. Open `chrome://extensions` (also works in Chromium, Edge, Brave…).
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `dist/chrome` directory.

</details>

### 4. Keep Aqua installed in Firefox

Firefox Stable does not normally allow unsigned extensions to remain installed. One option is to sign Aqua through Mozilla Add-ons without publicly listing it:

1. Create an account at [addons.mozilla.org](https://addons.mozilla.org/).
2. Generate API credentials at [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/addon/api/key/).
3. Export the credentials in your terminal:

   ```bash
   export WEB_EXT_API_KEY="your-issuer"
   export WEB_EXT_API_SECRET="your-secret"
   npm run sign:firefox
   ```

4. Find the resulting `.xpi` in `web-ext-artifacts/`.
5. In Firefox, open `about:addons`, use the gear menu and choose **Install Add-on From File…**.

Each new signature needs a higher `version` in `manifest.json`. Keep your signing credentials private. If Mozilla rejects the extension ID, set a unique ID in `manifest.json` as described by the error message.

An alternative is Firefox Developer Edition or Nightly, where developer settings can allow unsigned extensions. The `xpinstall.signatures.required` setting does not disable signature enforcement in Firefox Stable.

## Configure Gemini

Aqua requires your own Gemini API key. **No key is included in this repository**: the key field in the settings is empty until you paste yours (it says *Paste your own Gemini key here*). If you only use the [local AI](#local-ai-offline-optional), you do not need a key.

1. Create a key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Open the extension popup (toolbar icon) or Aqua's full settings, paste your key and select **Save key**.
3. Click **Test connection** to make a small live API request.
4. Select a model in settings if you want to use something other than the default.

The default model configured in this project is `gemini-3.5-flash-lite`. Model availability and names can change; check Google's [model documentation](https://ai.google.dev/gemini-api/docs/models) if you see a model-not-found error.

### Is Gemini free?

Google AI Studio offers a free API tier for eligible models, subject to rate limits and other conditions. Limits vary by model and project and can change. Check your project's current limits at [Google AI Studio rate limits](https://aistudio.google.com/rate-limit).

Aqua makes **one API request per question**. For example, 50 questions normally mean 50 API requests. The optional PDF feature does not add requests, but it makes each request longer (see [Reference PDFs](#reference-pdfs-optional)). Do not rely on unofficial reports of specific daily quotas.

Review Google's current data-use terms before sending study material. Data handling can differ by service and usage tier.

### Protect your API key

- Use your own key; never commit it to Git or include it in screenshots.
- The key is stored in browser `storage.local` **without encryption**. Anyone who can access your browser profile may be able to read it.
- Revoke the key when you no longer need it. Use available key restrictions and quota controls where possible.
- The content script does not receive the API key; the background context handles API requests. Chrome also restricts local storage access to trusted extension contexts.
- For a shared or production deployment, do not distribute a personal API key inside the extension. Use an authenticated backend instead. This repository does **not** include such a backend.

## How to use Aqua

### Open, hide and move the panel

| Action | Default shortcut |
|---|---|
| Open Aqua | `Alt` + `Shift` + `Z` |
| Hide Aqua and cancel the current request | `Alt` + `Shift` + `X` |
| Move the panel to the bottom left | `Ctrl` + `Alt` + `,` |
| Move the panel to the bottom right | `Ctrl` + `Alt` + `.` |

You can also click the Aqua toolbar icon and choose **Open panel**. In Firefox, shortcuts can be changed in Aqua's settings by clicking the field and pressing the new combination; in any browser you can use the browser's extension-shortcut page. If a shortcut does nothing, check whether it is unassigned or conflicts with another shortcut. The chosen side is remembered.

### Ask a question

1. Open a Moodle page.
2. Activate Aqua.
3. Choose **Selection** to use text you highlighted on the page, or **Questions** to view detected Moodle questions.
4. Select the question. Aqua suggests an answer mode, which you can change.
5. Click **Ask** and review the result.

Aqua does not run automatically in the background and does not submit anything to Moodle.

### Answer modes

| Mode | Best for | Output |
|---|---|---|
| **Quiz** | Single- or multiple-choice questions | Only the question number and option letter(s), such as `3) B` or `2) A, C` — small and discreet |
| **Text → Short** | Short written answers | One or two sentences (about 30–40 words) in a natural, direct tone, without stock AI phrases, lists or Markdown |
| **Text → Long** | Open-ended questions | A medium-length response, usually around 80–150 words |
| **Image** | Questions that are hard to extract as text (put in order, fill in the blanks, matching…) | The shortest text that answers exactly; several items go on separate lines, and several words to fill in are written the way a person would |

**Text** shows a small *Short · Long* choice only while it is selected, to save space. Written answers appear in small type (just so you can see how much text there is). If there are several separate texts, each goes on its own line. **Click a line to copy it** — there is no need to select it; it dims for a moment to confirm. The panel warns you if you try to use Quiz mode without answer options. The **Sent text** disclosure shows the exact text prepared for Gemini after the extension's redaction step, including any PDF excerpts.

If the model cannot answer confidently, Aqua can label the result **Hypothesis** or **Insufficient data**. Any commands or instructions returned by the model are never executed.

### Auto mode (optional)

Off by default. Enable it in **Settings → Keyboard shortcuts → Auto mode**. With the panel open on a Moodle quiz page, pressing **+** (or the numpad +) outside any text field:

1. looks for the first unanswered question **from the top of the page, in order** (questions you already answered are skipped);
2. makes **one request** for that question, always in Quiz mode;
3. ticks the suggested option(s) with a normal click — or, in questions with **dropdowns** (matching, gaps filled from a list), picks the suggested option in each empty dropdown — and scrolls to the next unanswered question.

Guarantees: **one question per key press** (holding the key does not repeat); it never submits or finishes the quiz and never changes page; it does not touch a question that already has an answer (in dropdown questions, a dropdown you already chose is never changed), one you answered while it was waiting, or a page in review mode (disabled inputs); if a single-choice question gets several suggestions, or none, nothing is ticked and you are told. If the model was not sure (Hypothesis / Insufficient data) it still ticks, but warns you to check. Each press uses one API request, so it counts toward your quota like any other question.

> Use it for practice and study only. Do not use it where AI help is not allowed (graded tests, exams). The model can be wrong: always check what was ticked.

### Image mode (paste a screenshot)

1. Take a screenshot yourself (for example with your system's screenshot tool, copying it to the clipboard).
2. In Aqua, choose **Image**, click the small box and press **Ctrl+V**. The image is **not displayed**; a short note says it was loaded and will be sent.
3. Click **Ask**. The answer comes back as brief text, with one line per item, and each line copies when clicked.

Aqua shrinks the image in your browser (longest side 1,568 px, re-encoded as JPEG) before sending it, keeps it only in memory and discards it after the answer. An image uses roughly 300–1,000 tokens and counts as **one** request. Note: the text redaction cannot hide personal data inside an image (your name, email or campus details in a screenshot), so crop the screenshot to the question.

**With your PDFs (optional):** in **Settings → Reference documents (PDF)**, with *Use my PDFs as reference* on, tick **Also use my PDFs for image questions**. Aqua then makes **two requests per image**: first Gemini reads the question from the image, Aqua searches your PDFs locally with that text, and then the image is sent together with the excerpts (visible under **Sent text**). The image goes to Google in both requests. If the option is off, the PDFs are not used with images.

### Web references (optional)

In **Settings → Web references**, tick **Use my links as reference** and paste up to **5 links** (one per line). Aqua asks Gemini to read those pages with its URL-context tool and to give them priority; the order is: your links → PDF excerpts (if enabled) → own knowledge. It works in all modes (Quiz, Text, Image). A separate option, **Allow searching the internet**, lets Gemini search only if the links have no concrete answer.

- **Requests:** still one per question, whatever the number of links.
- **Tokens:** this is the real cost. Every page read counts as input tokens (a long page can be thousands), so **adding many links is not recommended**; that is why the maximum is 5. After each answer Aqua shows how many links were read, how many could not be read and the total tokens used.
- **Limits of Gemini:** pages that need a login, paywalled pages, YouTube and Google Docs cannot be read. Google Search may not be available on the free tier; if Google rejects it, Aqua retries with the links only and says so. On paid plans searches can be billed.
- **Privacy:** the links (not their content from your computer) are sent to Google with each question. Links with credentials, `localhost` and private network addresses are rejected. Page content is treated as untrusted data.
- **Not verified yet:** tested with simulated Gemini responses only; no live call with the tools has been made.

### Reference PDFs (optional)

You can give Aqua your own study material so it checks it **before** relying on the model's general knowledge. This is **off by default**.

**How it works (local search):**

1. Open **Settings → Reference documents (PDF)**, tick **Use my PDFs as reference** (a cost and privacy notice appears) and click **Add PDFs…**. Choose one or more PDFs with selectable text.
2. Aqua reads the text in your browser with the bundled pdf.js, splits it into excerpts of about 220 words and stores a search index locally in the browser (IndexedDB). Images are ignored.
3. When you pick a question or selection, Aqua searches that index **on your computer** (BM25 keyword search, no network) and shows the best excerpts (default 4, configurable from 1 to 8) under **Sent text**.
4. When you press **Ask**, those excerpts are sent with the question as reference. The model is told to use them first and, if they do not contain the answer, to answer from its own knowledge.

If no excerpt matches well enough (at least two distinct question terms must match), nothing is added and the request is exactly as without PDFs. Aqua does **not** search the web or Google.

**What it costs:** each request that includes excerpts uses roughly **1,500–3,000 extra tokens**, about 2–4 times a normal request. This is an estimate, not a measurement. It does not add API requests, but it can reach token limits sooner and uses more of a paid plan.

**Privacy:** the excerpts are redacted like any other text and are sent to Google together with the question. File names are never sent. The PDFs and their index stay on your computer until you delete them in settings.

**Limits:** 10 documents, 20 MB per file, 1,000 pages per PDF and about 3 million characters in total. Adding a file with the same name replaces the old one.

**Private mode:** the PDF index is stored in the browser's IndexedDB, which Firefox blocks in private windows and when it is set to *never remember history*. PDFs cannot be added in those cases (the settings page shows a note when you enable the option).

### Change the panel appearance

Open **Settings → Panel customisation** (or use the toolbar popup for the main options) to configure:

- **Palette:** Aqua (cyan accents), Light (dark grey text) or Dark (light grey text). The default is **Dark**.
- **Size:** Ultra-small, Minimal or Normal. The default is **Ultra-small**.
- **Opacity:** 30–100% while idle; with a solid background the panel becomes opaque on hover or focus.
- **Position:** bottom-left or bottom-right (also switchable with the shortcuts above).
- **Background:** transparent (default) or solid.
- **Invisible unless hovered:** the panel stays invisible and only shows while the mouse is over it. It does not close, and it does not block clicks on the page while invisible. Off by default.
- **Fade-out:** enabled by default after 5 seconds without mouse, keyboard, scroll or touch activity; configurable from 1 to 300 seconds or disabled. It can be combined with *Invisible unless hovered*: the panel is visible under the mouse and fades if you stay idle, returning on any activity.

In transparent mode, text remains clear while the borders use the configured opacity. Changes apply when the panel is opened again.

**Ultra-small mode** removes the header (name, settings and close buttons) and the Sent text section, and shows only question numbers in the question list. The complete question is still sent when you ask. There are no hover hints on the question numbers. While processing, the Ask button shows “…”.

The settings page uses a clean water theme (gradient header, soft cards) and collapses the longer sections. The extension popup also provides quick access to the API key, connection test, palette, size, hover-only mode, the panel and full settings. Errors are shown in the same colour as the text, without red.

## Local AI (offline, optional)

Aqua can also answer with a model running **on your own computer**, with no internet and no API key. It talks to any server with the OpenAI-compatible API: **llama.cpp** (`llama-server`, recommended), Ollama, llamafile or LM Studio.

- **Switch** between Gemini and local AI with **Alt+Shift+Q** (Firefox). In Chrome, assign it in `chrome://extensions/shortcuts` (Chrome only allows 4 default shortcuts). A tiny "Local" / "Online" text appears in a corner; the panel does not open.
- Settings → **Local AI**: server address (default `http://localhost:23517`, this computer only), model name, max wait (default 90 s), **Allow access to localhost** (optional permission) and **Test connection**.
- Works best **with reference PDFs**: small models know far less than Gemini. Without excerpts it still answers, with a small warning. In local mode the excerpts never leave the computer.
- Not available in local mode: **image mode** (text-only model), "PDF + image" and web references.
- Aqua **cannot start the server** (browsers forbid it). Start it first; if it is off, Aqua says so right away.

### Setting up the local AI with the `local-ai/` folder

The [`local-ai/`](local-ai/) folder contains everything needed to run the AI **without installing anything**. You can use it in place or copy the whole folder to a USB drive / external disk and use it on another computer that has no internet.

```text
local-ai/
├── descargar.sh            # downloads llama.cpp (Windows + Linux) and the model into this folder
├── iniciar.sh / .bat       # starts the AI in a visible window (shows errors)
├── iniciar-oculto.sh / .bat# starts the AI hidden, in the background
├── parar.sh / .bat         # stops the AI and frees the RAM
├── win/                    # llama.cpp for Windows (filled by descargar.sh)
├── linux/                  # llama.cpp for Linux (filled by descargar.sh)
└── modelos/                # Qwen3.5-4B-Q4_K_M.gguf (~3 GB, filled by descargar.sh)
```

The programs and the model are **not in the repository** (GitHub does not allow 3 GB files); the script downloads the same versions for everyone.

**1. Download once** (needs internet; Linux, macOS, or Windows with Git Bash / WSL):

```bash
cd local-ai
bash descargar.sh
```

It downloads the latest CPU build of [llama.cpp](https://github.com/ggml-org/llama.cpp/releases) for Windows x64 and Linux x64, and the model [`Qwen_Qwen3.5-4B-Q4_K_M.gguf`](https://huggingface.co/bartowski/Qwen_Qwen3.5-4B-GGUF) (saved as `modelos/Qwen3.5-4B-Q4_K_M.gguf`). If the connection drops, run it again: it resumes. Manual steps are in [`local-ai/LEEME.txt`](local-ai/LEEME.txt).

**2. Start the AI** each time you use it:

| | Windows | Linux |
|---|---|---|
| Hidden (background) | double-click `iniciar-oculto.bat` | `bash iniciar-oculto.sh` |
| In a window (to see errors) | double-click `iniciar.bat` | `bash iniciar.sh` |
| Stop it | double-click `parar.bat` | `bash parar.sh` |

Loading the model takes ~30 s. The server listens only on `127.0.0.1:23517` (this computer) and loads the whole model into RAM (`-lm none`), so the USB speed only affects start-up. Start-up messages and errors are saved to `local-ai/iniciar.log`. On Linux the program is copied to `~/.aqua-llama` first, because USB drives are often mounted without execute permission.

**3. Connect Aqua:** Settings → **Local AI** → **Allow access to localhost** → **Test connection**. Add the topic PDFs under **Reference documents**, then switch with **Alt+Shift+Q** on a Moodle page.

With **Ollama** instead: `OLLAMA_ORIGINS=moz-extension://*,chrome-extension://*`, address `http://localhost:11434`, model e.g. `qwen3.5:4b`.

Rough speed on a modern 6-core CPU with a 4B model: ~12–20 s per quiz question (estimate, not yet measured). While it is running the model uses ~3–4 GB of RAM. Corporate PCs may block programs run from USB drives (AppLocker, antivirus); that cannot be fixed from Aqua.

## Privacy & security

Aqua is designed to send only the material needed for the question, not an entire Moodle page. Review the details below before using it with personal or sensitive content.

### Permissions

| Permission | Purpose |
|---|---|
| `activeTab` | Temporary access to the active tab after you activate Aqua |
| `scripting` | Injects the panel into the active tab when requested |
| `storage` | Saves your API key, settings and preferred mode |
| `generativelanguage.googleapis.com` host permission | Allows the extension background context to send requests to Gemini |
| `localhost` / `127.0.0.1` (optional, asked only when you press **Allow access to localhost**) | Lets Aqua talk to the local AI server on your own computer |

Aqua does not use static `content_scripts` to run on every website. PDF indexes are kept in the extension's own IndexedDB, which needs no extra permission.

### Access password (optional)

Aqua can ask for a password before showing the settings page, the quick-settings menu or the panel. It is asked **once per browser session**: the unlocked state lives in `storage.session`, which the browser clears when it closes (and when the extension is reloaded). While locked, the background also refuses requests to Gemini, PDF search and the connection test.

This is a **simple barrier against casual use, not real security**: only a SHA-256 hash of the password is stored, but it is inside the extension's code, so anyone with the source can read or remove it.

To set your own password before building, replace `PASS_HASH` in [`src/lock.js`](src/lock.js) with the hash of your password:

```bash
printf %s 'YOUR_PASSWORD' | sha256sum
```

Use `printf` with single quotes (`echo` adds a line break and the hash will not match). To turn the password off, set `PASS_HASH` to an empty string (`''`). Rebuild with `npm run build` afterwards.

### Data flow

1. You select text or a detected question.
2. The content script normalises, redacts and validates the material, then displays what is about to be sent.
3. If reference PDFs are enabled, the background context searches the local index and the best excerpts are shown in the same preview.
4. The request is passed to the extension background context and validated again; any excerpts are redacted again.
5. The background context sends an HTTPS request to Gemini — or, in local mode, a request to the AI server on your own computer (`127.0.0.1`), so nothing leaves the machine.
6. Aqua validates the response and renders it as text.

The panel uses `textContent` rather than rendering model output as HTML. Responses are not saved as a history, and the extension does not include telemetry. Questions, answers and secrets are not deliberately written to the console.

### Redaction and validation

Aqua attempts to redact common sensitive values, including email addresses, DNI/NIE numbers, IBANs, phone numbers, API/JWT/Bearer-style keys and values following labels such as “password”, “token” or “cookie”. The same redaction is applied to PDF excerpts.

Additional safeguards include:

- A configurable default limit of 6,000 characters per request, and at most about 9,000 characters of PDF excerpts.
- Validation of response structure, types, ranges and lengths.
- Treating page content and PDF excerpts as untrusted input, delimited with random markers.
- No execution or evaluation of model-generated content.
- Ignoring answer options outside the valid range.
- Using option text from the page, rather than inventing options from model output.
- Loading pdf.js only on the settings page (never in web pages), with script evaluation disabled.

**Redaction is not guaranteed to catch every sensitive value.** Check the displayed outgoing text before asking, and never send information you would not want to share with the API provider.

## Tests and verification

Run the automated test suite:

```bash
npm test
```

The tests cover core logic and simulated API responses, including:

- Moodle and non-Moodle pages.
- Opening, hiding and moving the panel; hover-only and fade-out behaviour.
- Empty and oversized text.
- Network errors, timeouts, rate limits, invalid keys and missing models.
- Empty, blocked, truncated and malformed responses.
- Request cancellation and late responses.
- Quiz, Text (short/long) and Image modes, including the `n) letter` output, one clickable line per text and the image pipeline.
- Clipboard fallback behaviour and copying a single line.
- HTML injection in model responses.
- Ensuring Moodle forms are not modified.
- Keeping the API key out of the content script.
- Access password: locked and unlocked states in the background, the settings page, the popup and the panel; refused requests while locked.
- Local AI mode: request format, schema fallback, server offline/forbidden errors, thinking-tag removal, the Gemini ↔ local switch and the hidden image mode.
- Reading real PDFs with pdf.js, chunking, search ranking, the IndexedDB store, upload limits and prompt-injection containment.
- Language files, shortcut capture, the quick-settings popup and the settings page.
- Manifest structure, permissions and the bundled pdf.js hashes.

Validate the Firefox package with:

```bash
npm run lint:firefox
```

To test the extension manually, load it in a real browser and verify activation, question extraction, a live Gemini request, copying, cancellation, shortcut reassignment, PDF upload and error messages. Also inspect the browser's Network panel to confirm that requests go only to `generativelanguage.googleapis.com` (or only to `127.0.0.1` in local mode) and that the key is sent in the request header.

## Project structure

```text
aqua-client/
├── manifest.json              # Firefox (primary)
├── manifest.chrome.json       # Chrome / Chromium
├── background.js
├── content.js
├── styles.css
├── popup.html / popup.css / popup.js
├── options.html / options.css / options.js
├── _locales/                  # extension name and description (en, es)
├── icons/                     # icon.svg + PNG 16/32/48/128
├── src/
│   ├── errors
│   ├── i18n
│   ├── textNormalizer
│   ├── settings
│   ├── lock               # access password (hash + session flag)
│   ├── lockGate           # password screen for settings and popup
│   ├── shortcuts
│   ├── moodleDetector
│   ├── questionExtractor
│   ├── prompts
│   ├── answerValidator
│   ├── geminiClient
│   ├── localClient            # local AI (OpenAI-compatible server)
│   ├── pdfIndex               # chunking + BM25 search
│   ├── pdfText                # PDF text extraction
│   ├── docStore               # IndexedDB store
│   ├── docManager             # adding PDFs, limits
│   ├── askService
│   ├── imageUtil              # pasted image: resize + re-encode
│   ├── ui
│   └── controller
├── vendor/
│   └── pdfjs/                 # pdf.js, unmodified (Apache-2.0)
├── test/
├── testkit/
├── scripts/
│   ├── build.mjs
│   └── vendor-pdfjs.mjs
├── local-ai/                  # scripts to download and run the local AI (see above)
├── config.example.json        # example with no secrets (Aqua does not read it)
├── LICENSE
└── .gitignore
```

## Troubleshooting

| Problem | What to check |
|---|---|
| The shortcut does nothing | Check the browser's extension-shortcut settings for conflicts or an unassigned shortcut; try **Open panel** in the toolbar popup |
| The extension icon shows `!` | The page may be restricted (such as `about:`, `chrome://` or an extension store), or `activeTab` access may be unavailable |
| Aqua says “This page doesn't look like Moodle” | Detection is heuristic and may not recognise heavily customised Moodle themes |
| I opened the panel but cannot see it | *Invisible unless hovered* may be on, or the panel faded after inactivity; move the mouse over its corner or press any key |
| Missing or rejected API key | Save the key in settings and check whether it is restricted, revoked or incorrect |
| Rate limit / HTTP 429 | Wait and review your project's current limits in Google AI Studio |
| Model not found | Choose a currently available model in settings |
| Response blocked | Gemini's safety filters may have blocked the request; try a different, appropriate question |
| Unexpected response format | The model did not return the expected JSON; retry or select another model |
| "Quiz mode is for choice questions" | The selected text has no numbered options; use **Questions** to load a Moodle question, or switch to **Text** |
| "No text found" when adding a PDF | The PDF is probably scanned images; Aqua cannot read images. Use a PDF with selectable text |
| PDF excerpts never appear | Check that *Use my PDFs as reference* is ticked, that documents are listed, and that the question shares at least two words with the documents (the search is by keywords, not meaning) |
| Local AI: "cannot connect" | Start the AI first (`local-ai/iniciar.sh` / `.bat`) and wait ~30 s; check `local-ai/iniciar.log`; in settings use **Allow access to localhost** |
| Local AI: `invalid argument` when starting | Your llama.cpp build is newer/older than the scripts expect; check the option name with `llama-server --help` and edit `iniciar.sh` / `.bat` |
| Panel styling is missing | A strict Content Security Policy on the page may block styles inside Shadow DOM |
| Copying fails | The page may restrict clipboard access; select and copy the response manually |
| Pasting an image does nothing | Choose **Image**, click the small box first, then press Ctrl+V; the clipboard must hold an image (PNG/JPEG/WebP), not a file path |
| "Unexpected error" when adding a PDF | Firefox private window or *never remember history* blocks IndexedDB; use a normal window with history enabled |

## Known limitations

- Real-browser and live-API testing remains to be completed.
- Moodle detection relies on page markers and may fail on customised themes; there is no manual “force Moodle” option yet.
- Question extraction has been tested against example HTML. Drag-and-drop, matching and cloze questions may be incomplete; Aqua displays a warning in supported cases.
- Images embedded in questions are not sent to Gemini automatically; use **Image** mode with a screenshot instead. Image paste has been tested with a synthetic clipboard event, not yet with a real system clipboard in Firefox.
- PDF search is keyword-based (BM25), not semantic: a question that uses different words from the document may find nothing. Scanned PDFs, password-protected PDFs, and the layout of tables and formulas are not handled well.
- Aqua itself does not search the web. With **Web references**, Gemini reads your links (and searches only if you allow it); otherwise the model answers from the supplied excerpts or its own knowledge.
- The local AI is much weaker than Gemini without reference PDFs, has no image mode and is slower on CPU (roughly 12–20 s per quiz question, estimated).
- Long answers are displayed as plain text; Markdown is not rendered.
- There is no answer history or print support by design.
- The access password is a deterrent, not security (see [Access password](#access-password-optional)). The shortcuts that switch AI or move the panel are not locked.
- Browser shortcut conflicts with each desktop environment have not been verified.
- A backend for shared deployments, end-to-end Playwright tests and some Firefox-specific shortcut/packaging work remain future improvements.

## Language

Open **Settings → Language / Idioma** and choose **English** or **Español**. The setting changes the panel, error messages, quick-settings popup and settings page. AI responses follow the language of the question. The extension name and description shown by the browser follow the browser's locale.

## Contributing

Issues, bug reports and improvements are welcome. When reporting a problem, include:

- Browser and version.
- Operating system.
- Steps to reproduce the issue.
- Relevant error messages, with API keys and personal information removed.

Please do not post API keys, private Moodle content or other sensitive data in issues.

## License

Aqua is released under the MIT License; see the `LICENSE` file for the full terms. The bundled pdf.js library keeps its own Apache-2.0 license (`vendor/pdfjs/LICENSE`).

---

<div align="center">

Aqua — a study companion that stays under your control.

</div>
