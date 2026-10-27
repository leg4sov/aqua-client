<div align="center">

# Aqua

### A lightweight AI study panel for Moodle

**Ask questions. Review learning material. Stay in control.**

Aqua is a Manifest V3 browser extension that helps you review Moodle questions and selected text with Google's Gemini API. It only runs when you activate it, and it never submits answers or interacts with Moodle forms.

<br>

[Features](#features) · [Installation](#installation) · [Configuration](#configure-gemini) · [Usage](#how-to-use-aqua) · [Privacy](#privacy--security) · [Troubleshooting](#troubleshooting)

<br>

![Firefox](https://img.shields.io/badge/Firefox-Primary-FF7139?logo=firefox-browser&logoColor=white)
![Chrome](https://img.shields.io/badge/Chrome%2FChromium-Secondary-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-64748b)
![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)

</div>

---

## Features

- **On-demand panel** — Aqua does nothing until you open it with a keyboard shortcut or the extension popup.
- **Three answer modes** — **Quiz** shows only the question number and option letter(s), **Short** gives a brief written answer, and **Long** gives a medium-length written response.
- **Moodle question detection** — extracts supported questions from Moodle pages, or lets you ask about text you select yourself.
- **Gemini API integration** — use your own Google AI Studio API key and choose the model in settings.
- **Optional reference PDFs** — add your own text-based PDFs; Aqua searches them locally and adds the most relevant excerpts to the request as reference (disabled by default).
- **Privacy-conscious processing** — sends only the selected question or text (plus any PDF excerpts you can see), not the entire page; attempts to redact common sensitive values before sending.
- **Uncertainty labels** — results can be labelled **Hypothesis** or **Insufficient data** when the model is not sure.
- **Customisable panel** — choose a colour palette, size (down to ultra-small), opacity, background and position.
- **Visibility modes** — show the panel only while the mouse is over it, fade it out after inactivity, or combine both.
- **English and Spanish interface** — English by default, with Spanish available in settings.
- **Keyboard shortcuts** — open and hide the panel, or move it left or right, without reaching for the toolbar.
- **Quick-settings popup** — the toolbar icon opens a compact menu for the API key, connection test, palette, size and visibility.
- **Automated tests** — cover core logic, PDF reading and search, error handling, validation, cancellation and extension-manifest checks.

> **Use Aqua responsibly.** It is intended for practice quizzes, revision pages and study materials. It does not fill in or submit Moodle forms. If you use it during an active quiz, confirm that AI assistance is permitted by your instructor. Do not use it for graded assessments where assistance is prohibited.

## Project status

Aqua's automated tests cover key components, but **the extension has not yet been verified end-to-end in a real browser or with a live Gemini API key**. Treat it as a version to test locally, not as a fully validated production release.

| Area | Status |
|---|---|
| Core logic, simulated Gemini client, request service and panel tests | Automated tests available |
| PDF reading, indexing and search | Automated tests with the real pdf.js library in Node and a simulated IndexedDB; not yet verified in a real browser |
| Firefox manifest | Checked with `web-ext lint`; no errors reported, plus warnings about Firefox for Android and about dynamic `import()` calls inside the bundled pdf.js |
| Firefox installation and real Moodle pages | Not yet manually verified |
| Chrome/Chromium installation | Not yet manually verified |
| Live Gemini API requests | Not yet verified with a real API key |
| Shortcuts, `activeTab` injection and Shadow DOM on a live Moodle site | Not yet manually verified |

## Compatibility

- **Primary browser:** Firefox 140 or newer, using the Firefox Manifest V3 configuration (`manifest.json`).
- **Secondary browser:** Chrome / Chromium, using the Chrome Manifest V3 configuration (`manifest.chrome.json`).
- **Development requirements:** Node.js 20 or newer and npm.
- **Operating system:** the build instructions below target Fedora Linux, but the extension itself is browser-based.

Build outputs are generated in `dist/firefox` and `dist/chrome`.

## Installation

### 1. Install the development tools

On Fedora:

```bash
sudo dnf install nodejs git
```

Make sure Node.js is version 20 or newer:

```bash
node --version
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

1. Install Chromium if needed:

   ```bash
   sudo dnf install chromium
   ```

2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `dist/chrome` directory.

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

Aqua requires your own Gemini API key.

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
| **Short** | Short written answers | One or two sentences (about 30–40 words) in a natural, direct tone, without stock AI phrases, lists or Markdown; with a copy button |
| **Long** | Open-ended questions | A medium-length response, usually around 80–150 words, with a copy button |

Written answers include a small **⧉** symbol to copy the text (it turns into ✓ when copied). The panel warns you if you try to use Quiz mode without answer options. The **Sent text** disclosure shows the exact text prepared for Gemini after the extension's redaction step, including any PDF excerpts.

If the model cannot answer confidently, Aqua can label the result **Hypothesis** or **Insufficient data**. Any commands or instructions returned by the model are never executed.

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

### Change the panel appearance

Open **Settings → Panel customisation** (or use the toolbar popup for the main options) to configure:

- **Palette:** Aqua (cyan accents), Light (dark grey text) or Dark (light grey text). The default is **Dark**.
- **Size:** Ultra-small, Minimal, Small or Normal. The default is **Minimal**.
- **Opacity:** 30–100% while idle; with a solid background the panel becomes opaque on hover or focus.
- **Position:** bottom-left or bottom-right (also switchable with the shortcuts above).
- **Background:** transparent (default) or solid.
- **Invisible unless hovered:** the panel stays invisible and only shows while the mouse is over it. It does not close, and it does not block clicks on the page while invisible. Off by default.
- **Fade-out:** enabled by default after 5 seconds without mouse, keyboard, scroll or touch activity; configurable from 1 to 300 seconds or disabled. It can be combined with *Invisible unless hovered*: the panel is visible under the mouse and fades if you stay idle, returning on any activity.

In transparent mode, text remains clear while the borders use the configured opacity. Changes apply when the panel is opened again.

**Ultra-small mode** removes the header (name, settings and close buttons) and the Sent text section, and shows only question numbers in the question list. The complete question is still sent when you ask; its text is available in a tooltip. While processing, the Ask button shows “…”.

The extension popup also provides quick access to the API key, connection test, palette, size, hover-only mode, the panel and full settings. Errors are shown in the same colour as the text, without red.

## Privacy & security

Aqua is designed to send only the material needed for the question, not an entire Moodle page. Review the details below before using it with personal or sensitive content.

### Permissions

| Permission | Purpose |
|---|---|
| `activeTab` | Temporary access to the active tab after you activate Aqua |
| `scripting` | Injects the panel into the active tab when requested |
| `storage` | Saves your API key, settings and preferred mode |
| `generativelanguage.googleapis.com` host permission | Allows the extension background context to send requests to Gemini |

Aqua does not use static `content_scripts` to run on every website. PDF indexes are kept in the extension's own IndexedDB, which needs no extra permission.

### Data flow

1. You select text or a detected question.
2. The content script normalises, redacts and validates the material, then displays what is about to be sent.
3. If reference PDFs are enabled, the background context searches the local index and the best excerpts are shown in the same preview.
4. The request is passed to the extension background context and validated again; any excerpts are redacted again.
5. The background context sends an HTTPS request to Gemini.
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
- Quiz, Short and Long modes, including the `n) letter` output.
- Clipboard fallback behaviour.
- HTML injection in model responses.
- Ensuring Moodle forms are not modified.
- Keeping the API key out of the content script.
- Reading real PDFs with pdf.js, chunking, search ranking, the IndexedDB store, upload limits and prompt-injection containment.
- Language files, shortcut capture, the quick-settings popup and the settings page.
- Manifest structure, permissions and the bundled pdf.js hashes.

Validate the Firefox package with:

```bash
npm run lint:firefox
```

To test the extension manually, load it in a real browser and verify activation, question extraction, a live Gemini request, copying, cancellation, shortcut reassignment, PDF upload and error messages. Also inspect the browser's Network panel to confirm that requests go only to `generativelanguage.googleapis.com` and that the key is sent in the request header.

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
├── icons/
├── src/
│   ├── errors
│   ├── i18n
│   ├── textNormalizer
│   ├── settings
│   ├── shortcuts
│   ├── moodleDetector
│   ├── questionExtractor
│   ├── prompts
│   ├── answerValidator
│   ├── geminiClient
│   ├── pdfIndex               # chunking + BM25 search
│   ├── pdfText                # PDF text extraction
│   ├── docStore               # IndexedDB store
│   ├── docManager             # adding PDFs, limits
│   ├── askService
│   ├── ui
│   └── controller
├── vendor/
│   └── pdfjs/                 # pdf.js, unmodified (Apache-2.0)
├── test/
├── testkit/
├── scripts/
│   ├── build.mjs
│   └── vendor-pdfjs.mjs
├── config.example.json
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
| "Quiz mode is for choice questions" | The selected text has no numbered options; use **Questions** to load a Moodle question, or switch to **Short** or **Long** |
| "No text found" when adding a PDF | The PDF is probably scanned images; Aqua cannot read images. Use a PDF with selectable text |
| PDF excerpts never appear | Check that *Use my PDFs as reference* is ticked, that documents are listed, and that the question shares at least two words with the documents (the search is by keywords, not meaning) |
| Panel styling is missing | A strict Content Security Policy on the page may block styles inside Shadow DOM |
| Copying fails | The page may restrict clipboard access; select and copy the response manually |

## Known limitations

- Real-browser and live-API testing remains to be completed.
- Moodle detection relies on page markers and may fail on customised themes; there is no manual “force Moodle” option yet.
- Question extraction has been tested against example HTML. Drag-and-drop, matching and cloze questions may be incomplete; Aqua displays a warning in supported cases.
- Images embedded in questions are not sent to Gemini.
- PDF search is keyword-based (BM25), not semantic: a question that uses different words from the document may find nothing. Scanned PDFs, password-protected PDFs, and the layout of tables and formulas are not handled well.
- Aqua does not search the web. The model answers from the supplied excerpts or its own knowledge.
- Long answers are displayed as plain text; Markdown is not rendered.
- There is no answer history or print support by design.
- Browser shortcut conflicts have not been verified on Fedora/GNOME.
- A backend for shared deployments, end-to-end Playwright tests and some Firefox-specific shortcut/packaging work remain future improvements.

## Language

Open **Settings → Language / Idioma** and choose **English** or **Español**. The setting changes the panel, error messages, quick-settings popup and settings page. Gemini responses follow the language of the question. The extension name and description shown by the browser follow the browser's locale.

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
