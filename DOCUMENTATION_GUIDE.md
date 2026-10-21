# BuildTrack Documentation & Paper Editing Guide

This guide governs all non-code tasks (writing or editing technical papers, user manuals, progress reports, presentation slides, or spreadsheets). The rules below exist to maximize token efficiency, prevent context window bloat, and maintain high writing quality.

## 1. Token Efficiency & File Handling
- **Surgical Edits Only:** Never output full document contents in chat responses when making revisions. ALWAYS use targeted search-and-replace tools or diff edits to modify local files.
- **Targeted Line Reading:** Never read entire long manuscripts or multi-page documents into context at once. Use line-range reads (`offset`/`limit`) or `grep` searches to read only the specific section, chapter, or lines being edited.
- **Modular Drafting:** Maintain long papers as split Markdown files (e.g., `docs/paper/01_introduction.md`, `docs/paper/02_methodology.md`) to keep context windows compact and prevent full-file re-reading loops.
- **Zero Conversational Fluff:** Deliver requested text changes, prose rewrites, or structural edits directly without conversational intros, pleasantries, or restatements of instructions.

## 2. On-Demand Reference Loading
- Read reference materials (style guides, citation guidelines, project specifications, or outlines) strictly on-demand when actively editing tone, formatting, or citations. Do not keep them permanently loaded in context.

## 3. Formatting & Output Rules
- Write documents in clean, standard Markdown (`.md`) or LaTeX (`.tex`) as requested.
- Maintain consistent terminology matching the project stack and domain (BuildTrack, QA workflows, construction site management, RLS, pins, blueprints).
- Do not modify or touch application code files (`src/`, `supabase/`) while performing documentation or paper tasks.

## 4. Audit Trail Integration
- Record major documentation additions or paper completions with a short log entry in `docs/audits/` following the repository audit guidelines.
