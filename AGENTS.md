# Project Curie — Developer & AI Agent Guide

Welcome to **Project Curie** (`project-curie`). This document provides operational guidelines, architecture references, and development conventions for human developers and autonomous AI agents working in this repository.

---

## 1. Project Mission & Overview

**Project Curie** is a self-hosted note-taking, synchronization, and AI intelligence ecosystem built to supercharge knowledge management in Obsidian, on the web, and on mobile.

Key capabilities include:
- **Obsidian Vault Syncing**: Seamless bidirectional synchronization with a self-hosted server backend.
- **Samsung Notes Ingestion (`.sdocx`)**: Automated extraction of Samsung Note archives into clean Obsidian Markdown notes with vector ink stylus drawings, transcribed digital text, and attached lecture audio recordings (`.m4a`).
- **Curie AI Brain**: Multi-turn conversational intelligence powered by the native `@google/genai` SDK and local Ollama, featuring real-time Server-Sent Events (SSE) streaming, configurable thinking effort, multimodal attachment analysis (PDFs, images, notes), and persistent chat sessions.
- **Web & Mobile Interface**: A responsive React 19 web and Capacitor Android application with dual-view ink/text toggling, in-browser audio lecture player, LaTeX math formulas, Obsidian-style metadata properties, and real-time directory search.

---

## 2. Monorepo Structure

```
project-curie/
├── client/              # Obsidian Community Plugin (TypeScript, esbuild)
│   ├── src/             # Plugin entry point, lifecycle, sync engine, settings
│   ├── manifest.json    # Obsidian plugin release manifest
│   └── esbuild.config.mjs
├── server/              # Self-hosted Fastify backend & storage engine (Node >= 24)
│   ├── src/
│   │   ├── modules/     # Ingestion (.sdocx), Vaults, Devices, Sync, AI Gateway
│   │   ├── db/          # Drizzle ORM schemas (SQLite/better-sqlite3)
│   │   └── server.ts    # Fastify server bootstrap & route registration
│   ├── storage/         # Local vault directory storage & uploaded assets
│   └── test/            # Integration & ingestion test suites
├── web/                 # Web & Mobile Application (React 19, Vite 6, Tailwind 4)
│   ├── src/
│   │   ├── api/         # Typed API client, SSE streaming consumer, storage bridge
│   │   ├── components/  # Note editor, AI panel, PDF viewer, audio player, file tree
│   │   ├── utils/       # LaTeX math normalizer, YAML frontmatter parser
│   │   ├── themes.css   # Centralized design tokens and typography rules
│   │   └── index.css    # Global stylesheet importing Tailwind, themes, and KaTeX
│   ├── android/         # Capacitor Android project wrapper & native bridge
│   └── vite.config.ts   # Rollup code-splitting manualChunks configuration
├── openspec/            # System specifications, proposals, and change records
└── AGENTS.md            # Agent instructions & development manual (this file)
```

---

## 3. Subsystems & Key Technical Decisions

### A. Backend AI Gateway (`server/src/modules/ai/`)
- **SDK**: Built with the official `@google/genai` library (`GoogleGenAI`).
- **Models**: Native support for modern Gemini models (e.g., `gemini-3.8-flash`, `gemini-3.8-pro`, `gemini-2.5-flash`, `gemini-2.0-flash`) as well as local Ollama instances.
- **Thinking Effort**: Configurable reasoning budget (`off`, `low`, `medium`, `high`) mapped to `thinkingConfig.thinkingBudget`.
- **SSE Streaming Route**: The endpoint `POST /vaults/:vaultId/ai/chat` uses Fastify's `reply.hijack()` and native Node HTTP response handling to prevent premature socket aborts during streaming.
- **Multimodal Context**: Resolves note markdown, PDFs, and images from the vault filesystem and injects them into the Gemini payload directly on the server without client re-uploading.
- **Persistent Sessions**: Chat conversations and message histories are persisted per vault (`GET /vaults/:vaultId/ai/conversations`, `DELETE /vaults/:vaultId/ai/conversations/:id`).

### B. Web Client & Design System (`web/`)
- **Theme & Typography ([`web/src/themes.css`](file:///home/sienna/Documents/personal/project-curie/web/src/themes.css))**:
  - Root tokens define slate surface backgrounds, indigo brand accents, and spacing scales.
  - **In-line code (`:not(pre) > code`)**: Styled with vibrant pink-red text (`#fb7185`), dark slate background (`rgba(30, 41, 59, 0.85)`), and rounded border.
  - **Big code blocks (`pre`)**: Kept with `background: transparent !important; border: none !important;` so syntax-highlighted or default code containers retain their clean default styling without artificial bounding boxes.
  - **Chat Typography (`.curie-chat-prose`)**: Dedicated vertical margins between paragraphs (`0.875rem`), structured heading gaps (`h1`-`h4`), and formatted lists to avoid text clumping.
- **LaTeX Math Rendering ([`web/src/utils/mathUtils.ts`](file:///home/sienna/Documents/personal/project-curie/web/src/utils/mathUtils.ts))**:
  - Normalizes LaTeX display brackets `\[ ... \]` to standard `$$\n...\n$$`.
  - Normalizes LaTeX inline parentheses `\( ... \)` to `$ ... $`.
  - Protects code blocks (fenced and inline) so code snippets are never modified by math regexes.
  - Auto-closes trailing or unclosed `$$` delimiters during streaming or incomplete responses.
  - Rendered via `remark-math` and `rehype-katex` with `katex/dist/katex.min.css` loaded globally.
- **Frontmatter Metadata ([`web/src/utils/frontmatter.ts`](file:///home/sienna/Documents/personal/project-curie/web/src/utils/frontmatter.ts))**:
  - Parses YAML frontmatter between `---` delimiters at the beginning of notes.
  - Strips frontmatter from the markdown body passed to `ReactMarkdown` to eliminate unwanted `<hr>` tags and unformatted text.
  - Renders a collapsible **Properties** inspector section at the top of notes with tags, dates, status pills, wikilinks, and file paths.
- **File Search & Path Visibility**:
  - Searches in the AI attachment modal and the vault sidebar match against both **file name** and **folder path**.
  - Search results display the full directory path (`f.path`) beneath each file name with a folder icon.
  - Attachment chips display parent directories for rapid identification of identically-named files.
- **Bundle Optimization ([`web/vite.config.ts`](file:///home/sienna/Documents/personal/project-curie/web/vite.config.ts))**:
  - Configures Rollup `manualChunks` to split vendor dependencies into cached modular chunks:
    - `index`: Main app code (~140 kB)
    - `katex`: KaTeX math parser & fonts (~262 kB)
    - `markdown-engine`: ReactMarkdown, remark, rehype, AST parsers (~340 kB)
    - `react-core`: React, React-DOM, Scheduler (~223 kB)
    - `icons`: Lucide and Tabler icons (~27 kB)
    - `capacitor`: Native runtime bridge (~8 kB)
  - All chunks remain strictly below the 500-600 kB bundler warning thresholds.

### C. Obsidian Client Plugin (`client/`)
- Minimal, clean Obsidian plugin lifecycle.
- Packaged via `esbuild.config.mjs` into `main.js`, `manifest.json`, and `styles.css`.
- Synchronizes local vault notes with the Curie server's SQLite store and vault directory.

---

## 4. Development Commands & Workflows

### Server (`server/`)
```bash
cd server
npm install                  # Install dependencies
npm run dev                  # Start Fastify dev server with hot reload (ts-node-dev)
npm run build                # Compile TypeScript to dist/
npm start                    # Run compiled server in production
npm run migrate              # Run Drizzle ORM migrations
npm test                     # Run ingestion test suite
```

### Web & Mobile Client (`web/`)
```bash
cd web
npm install                  # Install dependencies
npm run dev                  # Start Vite development server (http://localhost:5173)
npm run build                # Typecheck (tsc) and compile production bundle
npm run preview              # Preview production build locally
npm run android:sync         # Build web assets and sync to Capacitor Android project
npm run android:open         # Open Android Studio project
```

### Obsidian Plugin (`client/`)
```bash
cd client
npm install                  # Install dependencies
npm run dev                  # Watch and compile with esbuild
npm run build                # Typecheck and produce production bundle (main.js)
```

---

## 5. Guidelines for AI Coding Agents

When working on Project Curie, follow these rules:

1. **Verify Builds Proactively**:
   - After modifying TypeScript or React components in `web/`, always run `npm run build` in `web/` to ensure zero compilation or type errors.
   - Ensure no Rollup bundle chunk exceeds Vite's warning threshold.
2. **Preserve Code Block and Theme Styling**:
   - In-line code must retain pink-red `#fb7185` coloring on dark slate background (`bg-slate-800/85`).
   - Do NOT add a background to triple-backtick `<pre>` code blocks; keep `pre` background transparent.
3. **Respect Math & Markdown Normalization**:
   - When passing markdown to `ReactMarkdown`, always apply `normalizeLatexDelimiters` to ensure LaTeX math equations render cleanly.
   - Always strip frontmatter before markdown parsing and render metadata via the `MetadataSection`.
4. **Security & Secrets**:
   - Never commit API keys (`GEMINI_API_KEY`), tokens, or passwords to git.
   - Store secrets in `.env` files (e.g., `server/.env`).
5. **Specification Compliance**:
   - Check `openspec/specs/` before making architectural or breaking API changes.
   - Use the OpenSpec workflow skills (`openspec-propose`, `openspec-apply-change`) when planning significant new features.
