# Project Curie

> *Curie is a project made for my wife so that she could take better notes with Obsidian. This project is an ongoing effort to make note-taking better for her, and hopefully, by extension, for all of us.*

---

**Project Curie** is a self-hosted note-taking, synchronization, and AI intelligence ecosystem. It connects **Obsidian**, a **Web & Mobile client**, and a **Fastify backend server** into a unified personal knowledge management system.

---

## 🚀 Key Features

### 🧠 Curie AI Brain (Google Gemini & Ollama)
- **Native Gemini Integration**: Powered by the official `@google/genai` SDK, supporting Gemini 3.8 Flash, Gemini 3.8 Pro, Gemini 2.5 Flash, and Gemini 2.0.
- **Configurable Thinking Effort**: Choose reasoning levels (`Off`, `Low`, `Medium`, `High`) with an interactive accordion displaying the model's intermediate chain of thought.
- **Local LLM Support**: Switch seamlessly between Google Gemini and local Ollama models.
- **Multimodal Vault Context**: Attach notes, lecture PDFs, and diagram images directly into the chat prompt from your vault.
- **Persistent Conversation History**: Multi-turn conversations are saved per vault with history search and session management.
- **Resizable Interface**: Draggable split-panel drawer that preserves your layout across browser reloads.

### 📝 Samsung Notes (`.sdocx`) Ingestion & Dual-View
- **Automated Extraction**: Ingests `.sdocx` archives into standard Obsidian Markdown notes.
- **Stylus Ink Vector Drawings**: Preserves original handwritten strokes in SVG/vector format alongside OCR transcription.
- **Dual-View Switcher**: Toggle between handwriting-only, transcription-only, or synchronized split-view in the note viewer.
- **Audio Lecture Attachments**: Automatically extracts and plays voice recordings (`.m4a`, `.mp3`) directly inside the note.

### 📐 LaTeX & KaTeX Mathematical Rendering
- **Full Formula Support**: Native inline (`$...$`, `\(...\)`) and block display (`$$...$$`, `\[...\]`) math formulas.
- **Smart Delimiter Normalizer**: Automatically cleans and pads math demarcations, auto-closes streaming equations, and protects raw code blocks.
- **Stylized Math Containers**: Dedicated scrolling displays with subtle glow accents for complex mathematical proofs and chemical equations.

### 🗂️ Frontmatter Metadata & Note Properties
- **Obsidian Properties Inspector**: Automatically parses YAML metadata delimited by `---` at the top of notes.
- **Interactive Badges**: Renders status indicators for booleans, `#tag` pills, timestamps with calendar icons, and clickable `[[wikilinks]]`.
- **Clean Reading Experience**: Strips frontmatter delimiters from the note body to eliminate awkward horizontal lines and raw text.

### 🔍 Path-Aware Search & Context Picker
- **Instant Path Filtering**: Search vault notes by either filename or directory path.
- **Folder Path Badges**: AI context attachment picker and vault sidebar display the full file path underneath each search result to distinguish identically-named files across folders.

### 📱 Android & Web Client (Capacitor)
- **Cross-Platform**: Run as a desktop browser web app or native Android app built with Capacitor 8.
- **System Share Sheet Ingestion**: Share notes, PDFs, or files from Android apps directly into your Curie vault.
- **Ultra-Lightweight Bundle**: Spliced Rollup chunks (`index`, `katex`, `markdown-engine`, `react-core`, `icons`, `capacitor`) optimized for mobile loading.

---

## 🏗️ Architecture

```
project-curie/
├── client/    # Obsidian Community Plugin (TypeScript, esbuild)
├── server/    # Self-hosted Fastify backend & SQLite vault storage (Node >= 24)
├── web/       # Web & Mobile Application (React 19, Vite 6, Tailwind 4, Capacitor 8)
└── openspec/  # Architecture proposals, specifications, and design history
```

---

## 🛠️ Quickstart

### Prerequisites
- **Node.js**: `v24.14.0` or higher (see `.nvmrc`)
- **npm**: `v10+`
- **Google Gemini API Key** (optional, for AI features): Get a key at [Google AI Studio](https://aistudio.google.com/)

---

### 1. Curie Server (`server/`)

```bash
cd server
npm install

# Configure environment
cp .env.example .env  # or edit .env directly
# Add your GEMINI_API_KEY in server/.env:
# GEMINI_API_KEY=your_key_here

# Run database migrations
npm run migrate

# Start the development server (default port: 3000)
npm run dev
```

---

### 2. Web & Mobile Client (`web/`)

```bash
cd web
npm install

# Start Vite dev server with proxy to backend (http://localhost:5173)
npm run dev

# Build production bundle
npm run build

# Preview production build locally
npm run preview
```

#### Android Setup (Capacitor)
```bash
# Sync web build to Android project
npm run android:sync

# Open Android Studio to build and deploy to device
npm run android:open
```

---

### 3. Obsidian Plugin (`client/`)

```bash
cd client
npm install

# Compile plugin for Obsidian
npm run build

# Copy main.js, manifest.json, and styles.css into your vault:
# <Your-Vault>/.obsidian/plugins/project-curie-sync/
```

Enable the plugin in Obsidian under **Settings → Community plugins → Installed plugins**.

---

## 🎨 Design System & Customization

The web client includes a centralized design system in [`web/src/themes.css`](file:///home/sienna/Documents/personal/project-curie/web/src/themes.css):
- **Surfaces**: Dark slate theme (`#020617`, `#0f172a`, `#1e293b`) with indigo brand accents (`#6366f1`).
- **In-line Code**: Vibrant pink-red typography (`#fb7185`) on dark slate background (`rgba(30, 41, 59, 0.85)`).
- **Code Blocks**: Transparent backgrounds without artificial borders, preserving clean code typography.
- **Chat Typography**: Generous vertical spacing between paragraphs and headings to avoid text clumping.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
