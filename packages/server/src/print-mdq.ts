import { chromium, type Browser } from "playwright";
import { Quiz, Question, QuestionType } from "@mdq/shared";
import { parseQuizMarkdown, QuizParseError } from "./parser";
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

type PrintTheme = "dark" | "light";

interface PrintOptions {
  inputFile: string;
  outputFile: string;
  imagesDir: string;
  includeFoldouts: boolean;
  includePresenterNotes: boolean;
  includeAnswers: boolean;
  pageSize: "A4" | "Letter";
  theme: PrintTheme;
  title?: string;
  htmlOut?: string;
}

interface CliResult {
  options: PrintOptions;
  helpRequested: boolean;
}

const DATA_IMAGE_PREFIX = "/data/images/";
const IMAGE_MIME_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".svgz": "image/svg+xml",
  ".webp": "image/webp",
};
const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  poll: "Poll",
  open_response: "Open response",
  slide: "Slide",
};

function usage(): string {
  return `Usage:
  npm run print:pdf -- <quiz.md> [options]

Options:
  --out <file>          Output PDF path. Defaults to <quiz>.pdf next to the input file.
  --images-dir <dir>   Image attachment directory. Defaults to data/images.
  --foldouts           Include attendee fold-out notes expanded. Default.
  --no-foldouts        Hide all fold-out notes for a clean handout.
  --presenter-notes    Include presenter notes as well. Default: hidden.
  --no-presenter-notes Hide presenter notes. Default.
  --answers            Include correct-answer highlights and feedback.
  --no-answers         Hide correct answers and feedback. Default.
  --page-size <size>   A4 or Letter. Default: A4.
  --theme <theme>      dark or light. Default: dark.
  --title <title>      Override the PDF cover title.
  --html <file>        Also write the generated print HTML for debugging.
  -h, --help           Show this help.

Examples:
  npm run print:pdf -- data/quizzes/week00.md --theme light --out exports/week00.pdf
  npm run print:pdf -- data/quizzes/week12-hmd-simulator-course.md --theme dark --no-foldouts --page-size Letter
  npm run print:pdf -- data/quizzes/week12-hmd-simulator-course.md --theme dark --answers --presenter-notes
`;
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseArgs(argv: string[]): CliResult {
  let inputFile = "";
  let outputFile = "";
  let imagesDir = path.resolve("data/images");
  let includeFoldouts = true;
  let includePresenterNotes = false;
  let includeAnswers = false;
  let pageSize: PrintOptions["pageSize"] = "A4";
  let theme: PrintTheme = "dark";
  let title: string | undefined;
  let htmlOut: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      return {
        helpRequested: true,
        options: {
          inputFile: "",
          outputFile: "",
          imagesDir,
          includeFoldouts,
          includePresenterNotes,
          includeAnswers,
          pageSize,
          theme,
        },
      };
    }
    if (arg === "--out" || arg === "-o") {
      outputFile = readValue(argv, i, arg);
      i++;
      continue;
    }
    if (arg === "--images-dir") {
      imagesDir = path.resolve(readValue(argv, i, arg));
      i++;
      continue;
    }
    if (arg === "--foldouts") {
      includeFoldouts = true;
      continue;
    }
    if (arg === "--no-foldouts") {
      includeFoldouts = false;
      continue;
    }
    if (arg === "--presenter-notes") {
      includePresenterNotes = true;
      continue;
    }
    if (arg === "--no-presenter-notes") {
      includePresenterNotes = false;
      continue;
    }
    if (arg === "--answers") {
      includeAnswers = true;
      continue;
    }
    if (arg === "--no-answers") {
      includeAnswers = false;
      continue;
    }
    if (arg === "--page-size") {
      const value = readValue(argv, i, arg);
      const normalized = value.toLowerCase();
      if (normalized !== "a4" && normalized !== "letter") {
        throw new Error(`Unsupported page size "${value}". Use A4 or Letter.`);
      }
      pageSize = normalized === "a4" ? "A4" : "Letter";
      i++;
      continue;
    }
    if (arg === "--theme") {
      const value = readValue(argv, i, arg);
      const normalized = value.toLowerCase();
      if (normalized !== "dark" && normalized !== "light") {
        throw new Error(`Unsupported theme "${value}". Use dark or light.`);
      }
      theme = normalized;
      i++;
      continue;
    }
    if (arg === "--title") {
      title = readValue(argv, i, arg);
      i++;
      continue;
    }
    if (arg === "--html") {
      htmlOut = readValue(argv, i, arg);
      i++;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option ${arg}`);
    }
    if (inputFile) {
      throw new Error(`Unexpected extra argument ${arg}`);
    }
    inputFile = arg;
  }

  if (!inputFile) {
    throw new Error("Missing input markdown file.");
  }

  const resolvedInput = path.resolve(inputFile);
  const resolvedOutput = outputFile
    ? path.resolve(outputFile)
    : path.join(path.dirname(resolvedInput), `${path.basename(resolvedInput, path.extname(resolvedInput))}.pdf`);

  return {
    helpRequested: false,
    options: {
      inputFile: resolvedInput,
      outputFile: resolvedOutput,
      imagesDir,
      includeFoldouts,
      includePresenterNotes,
      includeAnswers,
      pageSize,
      theme,
      title,
      htmlOut: htmlOut ? path.resolve(htmlOut) : undefined,
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isExternalUrl(src: string): boolean {
  return /^(?:https?:|data:|file:|mailto:)/i.test(src);
}

function cleanLocalSrc(src: string): string {
  const withoutAnchor = src.split("#")[0];
  const withoutQuery = withoutAnchor.split("?")[0];
  try {
    return decodeURIComponent(withoutQuery);
  } catch {
    return withoutQuery;
  }
}

function localImageCandidates(src: string, inputDir: string, imagesDir: string): string[] {
  const cleanSrc = cleanLocalSrc(src);
  if (cleanSrc.startsWith(DATA_IMAGE_PREFIX)) {
    const relative = cleanSrc.slice(DATA_IMAGE_PREFIX.length).split("/").filter(Boolean).join(path.sep);
    return [
      path.join(imagesDir, relative),
      path.resolve(inputDir, "../images", relative),
    ];
  }

  if (cleanSrc.startsWith("/")) {
    return [path.resolve(cleanSrc.slice(1))];
  }

  return [path.resolve(inputDir, cleanSrc)];
}

function imageMimeType(filePath: string): string {
  return IMAGE_MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function imageDataUrl(filePath: string): string {
  const bytes = fs.readFileSync(filePath);
  return `data:${imageMimeType(filePath)};base64,${bytes.toString("base64")}`;
}

function toImageUrl(src: string, inputDir: string, imagesDir: string): string {
  const trimmed = src.trim();
  if (!trimmed || isExternalUrl(trimmed)) return trimmed;

  const candidates = localImageCandidates(trimmed, inputDir, imagesDir);
  const existing = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (existing) {
    return imageDataUrl(existing);
  }

  return pathToFileURL(candidates[0] || trimmed).href;
}

function rewriteImageSources(html: string, inputDir: string, imagesDir: string): string {
  return html.replace(/(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi, (_match, prefix: string, src: string, suffix: string) => (
    `${prefix}${escapeHtml(toImageUrl(src, inputDir, imagesDir))}${suffix}`
  ));
}

function renderTrustedHtml(html: string, inputDir: string, imagesDir: string): string {
  return rewriteImageSources(html, inputDir, imagesDir);
}

function questionHeading(question: Question): string {
  return question.subtopic ? `${question.topic}: ${question.subtopic}` : question.topic;
}

function questionType(question: Question): QuestionType {
  return question.questionType || "multiple_choice";
}

function questionTypeLabel(question: Question): string {
  return QUESTION_TYPE_LABELS[questionType(question)];
}

function buildStats(quiz: Quiz) {
  const slideCount = quiz.questions.filter((question) => questionType(question) === "slide").length;
  const pollCount = quiz.questions.filter((question) => questionType(question) === "poll").length;
  const openResponseCount = quiz.questions.filter((question) => questionType(question) === "open_response").length;
  return {
    total: quiz.questions.length,
    slides: slideCount,
    scored: quiz.questions.length - slideCount - pollCount - openResponseCount,
    polls: pollCount,
    openResponses: openResponseCount,
  };
}

function plural(value: number, label: string): string {
  return `${value} ${label}${value === 1 ? "" : "s"}`;
}

function renderNotes(
  question: Question,
  includeFoldouts: boolean,
  includePresenterNotes: boolean,
  inputDir: string,
  imagesDir: string,
): string {
  if (!includeFoldouts) return "";

  const attendeeNotes = (question.attendeeNotes || []).map((note) => ({ ...note, label: "Attendee note" }));
  const presenterNotes = includePresenterNotes
    ? (question.presenterNotes || []).map((note) => ({ ...note, label: "Presenter note" }))
    : [];
  const notes = [...attendeeNotes, ...presenterNotes];

  if (notes.length === 0) return "";

  return `
    <section class="foldouts" aria-label="Fold-out notes">
      ${notes.map((note) => `
        <aside class="note note-${note.audience}">
          <div class="note-label">${note.label}</div>
          <div class="note-body">${renderTrustedHtml(note.bodyHtml, inputDir, imagesDir)}</div>
        </aside>
      `).join("")}
    </section>
  `;
}

function renderSlideMedia(question: Question, inputDir: string, imagesDir: string): string {
  const media = question.slideMedia || [];
  if (media.length === 0) return "";

  const countClass = media.length >= 3 ? "media-grid-many" : `media-grid-${media.length}`;
  return `
    <section class="media-grid ${countClass}" aria-label="Slide images">
      ${media.map((item) => {
        const src = escapeHtml(toImageUrl(item.src, inputDir, imagesDir));
        const alt = escapeHtml(item.alt || "Slide image");
        const title = item.title ? escapeHtml(item.title) : "";
        return `
          <figure class="media-figure">
            <img src="${src}" alt="${alt}"${title ? ` title="${title}"` : ""}>
            ${title ? `<figcaption>${title}</figcaption>` : ""}
          </figure>
        `;
      }).join("")}
    </section>
  `;
}

function renderReferences(question: Question, inputDir: string, imagesDir: string): string {
  const references = question.slideReferences || [];
  if (references.length === 0) return "";

  return `
    <footer class="references">
      ${references.map((reference) => `<div>${renderTrustedHtml(reference.html, inputDir, imagesDir)}</div>`).join("")}
    </footer>
  `;
}

function renderOptions(question: Question, inputDir: string, imagesDir: string, includeAnswers: boolean): string {
  if (question.options.length === 0) return "";
  const correct = new Set(question.correctOptions);
  return `
    <ol class="options" aria-label="Answer options">
      ${question.options.map((option) => {
        const isCorrect = includeAnswers && correct.has(option.label);
        const className = isCorrect ? "option option-correct" : "option";
        return `
          <li class="${className}">
            <span class="option-label">${escapeHtml(option.label)}</span>
            <div class="option-text">${renderTrustedHtml(option.textHtml, inputDir, imagesDir)}</div>
            ${isCorrect ? "<span class=\"correct-chip\">Correct</span>" : ""}
          </li>
        `;
      }).join("")}
    </ol>
  `;
}

function renderAnswerBlock(question: Question, includeAnswers: boolean): string {
  if (!includeAnswers) return "";

  const type = questionType(question);
  if (type === "slide") return "";
  if (type === "poll") {
    return `
      <section class="answer-block answer-neutral">
        <strong>Poll</strong>
        <span>Not scored.</span>
      </section>
    `;
  }
  if (type === "open_response") {
    return `
      <section class="answer-block answer-neutral">
        <strong>Open response</strong>
        <span>Written response; not scored.</span>
      </section>
    `;
  }

  return `
    <section class="answer-block">
      <strong>Correct answer${question.correctOptions.length === 1 ? "" : "s"}</strong>
      <span>${escapeHtml(question.correctOptions.join(", "))}</span>
    </section>
  `;
}

function renderExplanation(question: Question, includeAnswers: boolean): string {
  if (!includeAnswers) return "";
  if (!question.explanation) return "";
  return `
    <section class="explanation">
      <strong>Overall feedback</strong>
      <p>${escapeHtml(question.explanation)}</p>
    </section>
  `;
}

function renderItem(question: Question, index: number, total: number, options: PrintOptions): string {
  const inputDir = path.dirname(options.inputFile);
  const type = questionType(question);
  const isSlide = type === "slide";
  const heading = questionHeading(question);
  const body = renderTrustedHtml(question.textHtml, inputDir, options.imagesDir);

  return `
    <article class="item item-${type}">
      <header class="item-header">
        <div class="item-kicker">
          <span>${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</span>
          <span>${questionTypeLabel(question)}</span>
          ${question.timeLimitSec > 0 ? `<span>${question.timeLimitSec}s</span>` : ""}
          ${question.allowsMultiple ? "<span>Multi-select</span>" : ""}
        </div>
        <h2>${escapeHtml(heading)}</h2>
      </header>
      <div class="${isSlide ? "slide-layout" : "question-layout"}">
        <section class="body-copy">${body || "<p class=\"empty-copy\">No body text.</p>"}</section>
        ${renderSlideMedia(question, inputDir, options.imagesDir)}
      </div>
      ${renderOptions(question, inputDir, options.imagesDir, options.includeAnswers)}
      ${renderAnswerBlock(question, options.includeAnswers)}
      ${renderExplanation(question, options.includeAnswers)}
      ${renderNotes(question, options.includeFoldouts, options.includePresenterNotes, inputDir, options.imagesDir)}
      ${renderReferences(question, inputDir, options.imagesDir)}
    </article>
  `;
}

function renderToc(quiz: Quiz): string {
  const midpoint = Math.ceil(quiz.questions.length / 2);
  const columns = [
    { offset: 0, questions: quiz.questions.slice(0, midpoint) },
    { offset: midpoint, questions: quiz.questions.slice(midpoint) },
  ];

  return `
    <section class="toc" aria-label="Deck contents">
      <h2>Contents</h2>
      <div class="toc-columns">
        ${columns.map(({ offset, questions }) => `
          <ol>
            ${questions.map((question, index) => `
              <li>
                <span>${String(offset + index + 1).padStart(2, "0")}</span>
                <strong>${escapeHtml(questionHeading(question))}</strong>
                <em>${questionTypeLabel(question)}</em>
              </li>
            `).join("")}
          </ol>
        `).join("")}
      </div>
    </section>
  `;
}

function renderThemeTokens(theme: PrintTheme): string {
  if (theme === "light") {
    return `
      --page-bg: #ffffff;
      --ink: #17151d;
      --body: #292532;
      --muted: #615c6b;
      --line: #d9d2e4;
      --soft-line: #eee9f5;
      --paper: #ffffff;
      --wash: #f7f4fb;
      --option-bg: #ffffff;
      --media-bg: #fbfafd;
      --accent: #7a3fe0;
      --accent-soft: #efe8ff;
      --teal: #0d827b;
      --teal-line: rgba(13, 130, 123, 0.35);
      --teal-soft: #e5f5f3;
      --amber: #9a6618;
      --amber-line: rgba(154, 102, 24, 0.38);
      --amber-soft: #fff2d8;
      --green: #0f7a42;
      --green-line: rgba(15, 122, 66, 0.45);
      --green-soft: #e7f6ed;
      --reference: #8a8493;
      --shadow: rgba(23, 21, 29, 0.04);
    `;
  }

  return `
      --page-bg: #242423;
      --ink: #f6f0ff;
      --body: #eee7f7;
      --muted: #b9aeca;
      --line: rgba(181, 111, 255, 0.46);
      --soft-line: rgba(181, 111, 255, 0.23);
      --paper: #2b292f;
      --wash: #343038;
      --option-bg: #302d34;
      --media-bg: #252429;
      --accent: #b56cff;
      --accent-soft: rgba(181, 108, 255, 0.18);
      --teal: #70ddd3;
      --teal-line: rgba(112, 221, 211, 0.42);
      --teal-soft: rgba(57, 171, 164, 0.2);
      --amber: #f2bd73;
      --amber-line: rgba(242, 189, 115, 0.42);
      --amber-soft: rgba(242, 189, 115, 0.18);
      --green: #78d99b;
      --green-line: rgba(120, 217, 155, 0.46);
      --green-soft: rgba(72, 176, 105, 0.2);
      --reference: #a69daf;
      --shadow: rgba(0, 0, 0, 0.18);
    `;
}

function renderStyles(pageSize: PrintOptions["pageSize"], theme: PrintTheme): string {
  const pageRule = pageSize === "Letter" ? "size: Letter;" : "size: A4;";
  const pageBackground = theme === "dark" ? "#242423" : "#ffffff";
  return `
    :root {
      ${renderThemeTokens(theme)}
    }

    @page {
      ${pageRule}
      margin: 14mm 14mm 16mm;
      background: ${pageBackground};
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--page-bg);
      color: var(--ink);
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 10.6pt;
      line-height: 1.46;
    }

    a {
      color: var(--accent);
      text-decoration: none;
      overflow-wrap: anywhere;
    }

    img {
      max-width: 100%;
      height: auto;
      object-fit: contain;
    }

    .cover {
      display: grid;
      min-height: 228mm;
      align-content: start;
      gap: 8mm;
      padding: 4mm 0 0;
      break-after: page;
    }

    .item-kicker,
    .note-label,
    .references {
      color: var(--muted);
      font-size: 7.5pt;
      font-weight: 800;
      letter-spacing: 0.11em;
      text-transform: uppercase;
    }

    .cover h1 {
      max-width: 170mm;
      margin: 8mm 0 4mm;
      font-size: 33pt;
      line-height: 0.98;
      letter-spacing: 0;
    }

    .item,
    .toc,
    .option,
    .answer-block,
    .explanation,
    .note {
      border: 1px solid var(--line);
      border-radius: 7px;
      background: var(--paper);
    }

    .toc {
      padding: 5mm;
      background: var(--wash);
    }

    .toc h2 {
      margin: 0 0 3mm;
      font-size: 13pt;
    }

    .toc-columns {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 7mm;
    }

    .toc ol {
      display: grid;
      gap: 1.1mm;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .toc li {
      display: grid;
      grid-template-columns: 9mm 1fr;
      gap: 2.2mm;
      align-items: baseline;
      padding-bottom: 1.2mm;
      border-bottom: 1px solid var(--soft-line);
      break-inside: avoid;
    }

    .toc li:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }

    .toc strong {
      font-size: 8.6pt;
      line-height: 1.18;
    }

    .toc span {
      color: var(--muted);
      font-size: 7.5pt;
      font-style: normal;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .toc em {
      display: none;
    }

    .item {
      margin: 0 0 6mm;
      padding: 6mm;
      break-inside: avoid-page;
      box-shadow: 0 0.6mm 0 var(--shadow);
    }

    .item-header {
      margin-bottom: 4mm;
      padding-bottom: 3.2mm;
      border-bottom: 1px solid var(--soft-line);
    }

    .item-kicker {
      display: flex;
      flex-wrap: wrap;
      gap: 2mm;
      margin-bottom: 2.2mm;
    }

    .item-kicker span {
      padding: 1.2mm 2mm;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
    }

    .item h2 {
      margin: 0;
      font-size: 18pt;
      line-height: 1.08;
      letter-spacing: 0;
    }

    .body-copy {
      min-width: 0;
      color: var(--body);
      font-size: 11.2pt;
    }

    .body-copy > :first-child {
      margin-top: 0;
    }

    .body-copy > :last-child {
      margin-bottom: 0;
    }

    .body-copy ul,
    .body-copy ol {
      padding-left: 5mm;
    }

    .body-copy li {
      margin: 1.2mm 0;
    }

    .question-layout,
    .slide-layout {
      display: grid;
      gap: 4mm;
    }

    .slide-layout:has(.media-grid) {
      grid-template-columns: minmax(0, 0.92fr) minmax(54mm, 1fr);
      align-items: start;
    }

    .media-grid {
      display: grid;
      gap: 3mm;
      break-inside: avoid;
    }

    .media-grid-2,
    .media-grid-many {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .media-grid-many .media-figure:first-child {
      grid-column: 1 / -1;
    }

    .media-figure {
      margin: 0;
      padding: 2.2mm;
      border: 1px solid var(--soft-line);
      border-radius: 6px;
      background: var(--media-bg);
      break-inside: avoid;
    }

    .media-figure img {
      display: block;
      width: 100%;
      max-height: 74mm;
      margin: 0 auto;
    }

    .media-grid-1 .media-figure img,
    .media-grid-many .media-figure:first-child img {
      max-height: 92mm;
    }

    .media-figure figcaption {
      margin-top: 1.6mm;
      color: var(--muted);
      font-size: 7.7pt;
      line-height: 1.3;
      text-align: center;
    }

    .quiz-embedded-image {
      display: block;
      max-height: 78mm;
      margin: 3mm auto;
      border: 1px solid var(--soft-line);
      border-radius: 6px;
      background: var(--media-bg);
      padding: 2mm;
    }

    .options {
      display: grid;
      gap: 2mm;
      margin: 5mm 0 0;
      padding: 0;
      list-style: none;
    }

    .option {
      position: relative;
      display: grid;
      grid-template-columns: 8mm 1fr auto;
      gap: 3mm;
      align-items: start;
      min-height: 10mm;
      padding: 2.8mm 3mm;
      background: var(--option-bg);
      break-inside: avoid;
    }

    .option-correct {
      border-color: var(--green-line);
      background: var(--green-soft);
    }

    .option-label {
      display: inline-grid;
      width: 7mm;
      height: 7mm;
      place-items: center;
      border-radius: 999px;
      background: var(--wash);
      color: var(--accent);
      font-size: 8pt;
      font-weight: 900;
    }

    .option-correct .option-label {
      background: var(--green);
      color: #fff;
    }

    .option-text > :first-child {
      margin-top: 0;
    }

    .option-text > :last-child {
      margin-bottom: 0;
    }

    .correct-chip {
      align-self: center;
      color: var(--green);
      font-size: 7pt;
      font-weight: 900;
      letter-spacing: 0.09em;
      text-transform: uppercase;
    }

    .answer-block,
    .explanation,
    .foldouts,
    .references {
      margin-top: 3mm;
    }

    .answer-block {
      display: flex;
      gap: 2mm;
      align-items: baseline;
      padding: 2.8mm 3.2mm;
      border-color: var(--green-line);
      background: var(--green-soft);
      color: var(--green);
      break-inside: avoid;
    }

    .answer-neutral {
      border-color: var(--line);
      background: var(--wash);
      color: var(--muted);
    }

    .explanation {
      padding: 3mm 3.2mm;
      border-color: var(--teal-line);
      background: var(--teal-soft);
      break-inside: avoid;
    }

    .explanation p {
      margin: 1mm 0 0;
    }

    .foldouts {
      display: grid;
      gap: 2mm;
    }

    .note {
      padding: 3mm;
      break-inside: avoid;
    }

    .note-attendee {
      border-color: var(--teal-line);
      background: var(--teal-soft);
    }

    .note-presenter {
      border-color: var(--amber-line);
      background: var(--amber-soft);
    }

    .note-body > :first-child {
      margin-top: 1mm;
    }

    .note-body > :last-child {
      margin-bottom: 0;
    }

    .references {
      padding-top: 2mm;
      border-top: 1px solid var(--soft-line);
      color: var(--reference);
      font-size: 7.6pt;
      font-weight: 600;
      letter-spacing: 0;
      line-height: 1.35;
      text-align: right;
      text-transform: none;
    }

    .empty-copy {
      color: var(--muted);
      font-style: italic;
    }

    @media print {
      .item:nth-of-type(8n) {
        break-after: auto;
      }
    }
  `;
}

function buildHtml(quiz: Quiz, options: PrintOptions): string {
  const title = options.title || quiz.title || path.basename(options.inputFile);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${renderStyles(options.pageSize, options.theme)}</style>
</head>
<body>
  <main>
    <section class="cover">
      <div>
        <h1>${escapeHtml(title)}</h1>
      </div>
      ${renderToc(quiz)}
    </section>
    ${quiz.questions.map((question, index) => renderItem(question, index, quiz.questions.length, options)).join("")}
  </main>
</body>
</html>`;
}

function reportParseErrors(errors: QuizParseError[]): string {
  return errors.map((error) => `- ${error.message}`).join("\n");
}

function withPlaywrightInstallHint(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Executable doesn't exist") || message.includes("Looks like Playwright")) {
    return new Error("Playwright Chromium is not installed. Run `npx playwright install chromium` once, then retry.");
  }
  return error instanceof Error ? error : new Error(message);
}

async function writePdf(html: string, options: PrintOptions): Promise<void> {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: options.pageSize === "Letter" ? 816 : 794, height: options.pageSize === "Letter" ? 1056 : 1123 },
      deviceScaleFactor: 2,
    });
    await page.setContent(html, { waitUntil: "load" });
    await page.emulateMedia({ media: "print" });
    await fs.promises.mkdir(path.dirname(options.outputFile), { recursive: true });
    await page.pdf({
      path: options.outputFile,
      format: options.pageSize,
      printBackground: true,
      preferCSSPageSize: true,
      scale: 1,
      tagged: true,
    });
  } catch (error: unknown) {
    throw withPlaywrightInstallHint(error);
  } finally {
    await browser?.close();
  }
}

async function main(): Promise<void> {
  const { options, helpRequested } = parseArgs(process.argv.slice(2));
  if (helpRequested) {
    console.log(usage());
    return;
  }

  if (!fs.existsSync(options.inputFile)) {
    throw new Error(`Input file not found: ${options.inputFile}`);
  }

  const markdown = await fs.promises.readFile(options.inputFile, "utf-8");
  const result = parseQuizMarkdown(markdown, path.basename(options.inputFile));
  if (!result.quiz) {
    throw new Error(`Could not parse quiz:\n${reportParseErrors(result.errors)}`);
  }
  if (result.errors.length > 0) {
    throw new Error(`Quiz has parse errors:\n${reportParseErrors(result.errors)}`);
  }

  const html = buildHtml(result.quiz, options);
  if (options.htmlOut) {
    await fs.promises.mkdir(path.dirname(options.htmlOut), { recursive: true });
    await fs.promises.writeFile(options.htmlOut, html, "utf-8");
  }

  await writePdf(html, options);
  const stats = await fs.promises.stat(options.outputFile);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
  const deckStats = buildStats(result.quiz);
  console.log(`Printed ${plural(deckStats.total, "item")} to ${options.outputFile} (${sizeMb} MB)`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`print:pdf failed: ${message}`);
  process.exitCode = 1;
});
