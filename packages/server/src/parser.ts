import {
  Quiz,
  Question,
  QuestionOption,
  DEFAULT_TIME_LIMIT_SEC,
  QuestionType,
  FoldoutNote,
  SlideMedia,
  SlideLiveEmbed,
  SlideReference,
} from "@mdq/shared";
import { marked } from "marked";

const QUIZ_IMAGE_SOURCE_PREFIX = "../images/";
const QUIZ_IMAGE_PUBLIC_PREFIX = "/data/images/";
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\((<[^>]+>|[^)\s]+)(?:\s+["']([^"']+)["'])?\)/g;

/** Error describing a problem in a specific question block */
export class QuizParseError extends Error {
  constructor(
    public readonly sourceFile: string,
    public readonly questionIndex: number,
    public readonly detail: string,
    public readonly lineNumber?: number,
  ) {
    const location = lineNumber ? `${sourceFile}:${lineNumber}` : sourceFile;
    const questionLabel = questionIndex >= 0 ? `Question ${questionIndex + 1}` : "Quiz";
    super(`[${location}] ${questionLabel}: ${detail}`);
    this.name = "QuizParseError";
  }
}

/** Result of parsing, containing successfully parsed quiz and any validation errors */
export interface ParseResult {
  quiz: Quiz | null;
  errors: QuizParseError[];
}

interface QuestionBlock {
  block: string;
  startLine: number;
}

/**
 * Parse a markdown quiz file into a Quiz object.
 * Follows PRD Section 8 parsing rules exactly.
 */
export function parseQuizMarkdown(markdown: string, sourceFile: string): ParseResult {
  const errors: QuizParseError[] = [];

  const title = extractDeckTitle(markdown);

  // Extract deck key from filename (e.g., "week01.md" -> "week01", "dis2026-hmd-simulator.md" -> "dis2026-hmd-simulator")
  const sourceStem = sourceFile.replace(/^.*[\\/]/, "").replace(/\.md$/i, "").toLowerCase();
  const week = sourceStem;

  // Split into question blocks by horizontal rules (---)
  // First, find where questions start (after title and any preamble)
  const sections = splitQuestionBlocks(markdown);

  const questions: Question[] = [];

  for (let i = 0; i < sections.length; i++) {
    const { block: rawBlock, startLine } = sections[i];
    const block = rawBlock.trim();
    if (!block) continue;

    try {
      const question = parseQuestionBlock(block, i, sourceFile, startLine);
      questions.push(question);
    } catch (e) {
      if (e instanceof QuizParseError) {
        errors.push(e);
      } else {
        errors.push(new QuizParseError(sourceFile, i, `Unexpected error: ${e}`, startLine));
      }
    }
  }

  if (questions.length === 0 && errors.length === 0) {
    errors.push(new QuizParseError(sourceFile, -1, "No questions found in file", 1));
  }

  const quiz: Quiz = {
    week,
    title,
    questions,
    sourceFile,
  };

  return { quiz: questions.length > 0 ? quiz : null, errors };
}

/**
 * Split markdown into question blocks using --- separators.
 * Only blocks that contain an H2 heading are treated as question blocks.
 */
function splitQuestionBlocks(markdown: string): QuestionBlock[] {
  // Stop parsing at "## Learning Objectives" per PRD rule 10
  const stopIdx = markdown.search(/^##\s+Learning\s+Objectives/mi);
  const content = stopIdx >= 0 ? markdown.substring(0, stopIdx) : markdown;
  const lines = content.split("\n");
  const blocks: QuestionBlock[] = [];
  let currentLines: string[] = [];
  let currentStartLine = 1;

  const pushCurrentBlock = () => {
    const block = currentLines.join("\n");
    if (/^##\s+/m.test(block)) {
      blocks.push({ block, startLine: currentStartLine });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    if (/^---+\s*$/.test(lines[i].trim())) {
      pushCurrentBlock();
      currentLines = [];
      currentStartLine = i + 2;
      continue;
    }
    currentLines.push(lines[i]);
  }

  pushCurrentBlock();
  return blocks;
}

function extractDeckTitle(markdown: string): string {
  const preamble = markdown.split(/^---+\s*$/m, 1)[0] || markdown;
  const metadataTitleMatch = preamble.match(/^title:\s*(.+)$/im);
  if (metadataTitleMatch) {
    return stripOptionalQuotes(metadataTitleMatch[1].trim());
  }

  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  return titleMatch ? titleMatch[1].trim() : "";
}

function stripOptionalQuotes(value: string): string {
  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Parse a single question block into a Question object.
 */
function parseQuestionBlock(block: string, index: number, sourceFile: string, blockStartLine: number): Question {
  const lines = block.split("\n");

  // 1. Extract topic from H2 heading
  const h2Match = block.match(/^##\s+(.+)$/m);
  if (!h2Match) {
    throw new QuizParseError(sourceFile, index, "Missing H2 topic heading", blockStartLine);
  }
  const topicRaw = h2Match[1].trim();
  const h2LineNumber = findLineNumber(lines, blockStartLine, (line) => /^##\s+/.test(line));
  const colonIdx = topicRaw.indexOf(":");
  const topic = colonIdx >= 0 ? topicRaw.substring(0, colonIdx).trim() : topicRaw;
  const subtopic = colonIdx >= 0 ? topicRaw.substring(colonIdx + 1).trim() : undefined;

  // 2. Extract time_limit (optional, after H2, before question text)
  let timeLimitSec = DEFAULT_TIME_LIMIT_SEC;
  const timeLimitMatch = block.match(/^time_limit:\s*(\d+)\s*$/m);
  if (timeLimitMatch) {
    timeLimitSec = parseInt(timeLimitMatch[1], 10);
    if (timeLimitSec <= 0) {
      throw new QuizParseError(
        sourceFile,
        index,
        `Invalid time_limit: ${timeLimitMatch[1]} (must be positive)`,
        findLineNumber(lines, blockStartLine, (line) => /^time_limit:\s*/i.test(line)),
      );
    }
  }

  const questionTypeMatch = block.match(/^(?:type|question_type):\s*([a-z_]+)\s*$/im);
  const questionType = questionTypeMatch?.[1].trim().toLowerCase() as QuestionType | undefined;
  if (questionType && questionType !== "poll" && questionType !== "open_response" && questionType !== "slide") {
    throw new QuizParseError(
      sourceFile,
      index,
      `Unsupported type: ${questionType}`,
      findLineNumber(lines, blockStartLine, (line) => /^(?:type|question_type):\s*/i.test(line)),
    );
  }
  const normalizedQuestionType: QuestionType = questionType || "multiple_choice";
  const isPoll = normalizedQuestionType === "poll";
  const isOpenResponse = normalizedQuestionType === "open_response";
  const isSlide = normalizedQuestionType === "slide";

  if (isSlide && timeLimitMatch) {
    throw new QuizParseError(
      sourceFile,
      index,
      "slide items must not use time_limit",
      findLineNumber(lines, blockStartLine, (line) => /^time_limit:\s*/i.test(line)),
    );
  }

  const multiSelectMatch = block.match(/^multi_select:\s*(true|false|yes|no|1|0)\s*$/im);
  if ((isOpenResponse || isSlide) && multiSelectMatch) {
    throw new QuizParseError(
      sourceFile,
      index,
      isSlide ? "slide items must not use multi_select" : "open_response questions must not use multi_select",
      findLineNumber(lines, blockStartLine, (line) => /^multi_select:\s*/i.test(line)),
    );
  }

  // 3. Extract answer options (lines starting with A., B., C., etc.)
  const optionLines: { label: string; text: string; lineIndex: number }[] = [];
  const optionRegex = /^([A-Z])\.\s+(.+)$/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(optionRegex);
    if (m) {
      optionLines.push({ label: m[1], text: m[2], lineIndex: i });
    }
  }

  if ((isOpenResponse || isSlide) && optionLines.length > 0) {
    throw new QuizParseError(
      sourceFile,
      index,
      isSlide ? "slide items must not define answer options" : "open_response questions must not define answer options",
      blockStartLine + optionLines[0].lineIndex,
    );
  }

  if (!isOpenResponse && !isSlide && optionLines.length === 0) {
    throw new QuizParseError(
      sourceFile,
      index,
      "No answer options found (expected A., B., C., ...)",
      findQuestionPromptLineNumber(lines, blockStartLine, h2LineNumber),
    );
  }

  // 4. Extract correct answer(s) from blockquote
  const correctSingleMatch = block.match(/^>\s*Correct\s+Answer:\s*([A-Z])[.\s]*/m);
  const correctMultiMatch = block.match(/^>\s*Correct\s+Answers:\s*(.+)$/m);

  let correctOptions: string[];
  if (isSlide) {
    if (correctSingleMatch || correctMultiMatch) {
      throw new QuizParseError(
        sourceFile,
        index,
        "slide items must not define correct answers",
        findLineNumber(lines, blockStartLine, (line) => /^>\s*Correct\s+Answer/i.test(line)),
      );
    }
    correctOptions = [];
  } else if (isOpenResponse) {
    if (correctSingleMatch || correctMultiMatch) {
      throw new QuizParseError(
        sourceFile,
        index,
        "open_response questions must not define correct answers",
        findLineNumber(lines, blockStartLine, (line) => /^>\s*Correct\s+Answer/i.test(line)),
      );
    }
    correctOptions = [];
  } else if (isPoll) {
    if (correctSingleMatch || correctMultiMatch) {
      throw new QuizParseError(
        sourceFile,
        index,
        "Poll questions must not define correct answers",
        findLineNumber(lines, blockStartLine, (line) => /^>\s*Correct\s+Answer/i.test(line)),
      );
    }
    correctOptions = [];
  } else if (correctMultiMatch) {
    correctOptions = correctMultiMatch[1].split(",").map((s) => s.trim().charAt(0));
  } else if (correctSingleMatch) {
    correctOptions = [correctSingleMatch[1]];
  } else {
    throw new QuizParseError(
      sourceFile,
      index,
      "Missing correct answer line (expected '> Correct Answer: X' or '> Correct Answers: X, Y')",
      optionLines[0] ? blockStartLine + optionLines[0].lineIndex : h2LineNumber,
    );
  }

  // Validate correct options reference existing labels
  const validLabels = new Set(optionLines.map((o) => o.label));
  for (const opt of correctOptions) {
    if (!validLabels.has(opt)) {
      throw new QuizParseError(
        sourceFile,
        index,
        `Correct answer "${opt}" does not match any option label (${[...validLabels].join(", ")})`,
        findLineNumber(lines, blockStartLine, (line) => /^>\s*Correct\s+Answer/i.test(line)),
      );
    }
  }

  const allowsMultiple = isOpenResponse || isSlide
    ? false
    : multiSelectMatch
    ? parseBooleanField(multiSelectMatch[1])
    : isPoll
      ? false
      : correctOptions.length > 1;

  if (!allowsMultiple && correctOptions.length > 1) {
    throw new QuizParseError(
      sourceFile,
      index,
      "multi_select: false cannot be used with multiple correct answers",
      findLineNumber(lines, blockStartLine, (line) => /^multi_select:\s*/i.test(line)),
    );
  }

  // 5. Extract explanation from blockquote. Continuation blockquote lines belong
  // to the same feedback until another MDQ metadata block starts.
  const explanation = extractOverallFeedback(lines);

  // 6. Extract question text (between H2/time_limit and first option)
  const h2LineIdx = lines.findIndex((l) => /^##\s+/.test(l));
  const firstOptionLineIdx = optionLines[0]?.lineIndex ?? Number.POSITIVE_INFINITY;
  const firstBlockquoteLineIdx = lines.findIndex((line) => /^>\s*/.test(line.trim()));
  const contentEndLineIdx = isSlide
    ? lines.length
    : Math.min(
      firstOptionLineIdx,
      firstBlockquoteLineIdx >= 0 ? firstBlockquoteLineIdx : Number.POSITIVE_INFINITY,
      lines.length,
    );

  let textLines = lines.slice(h2LineIdx + 1, contentEndLineIdx);
  // Remove time_limit line from text
  textLines = textLines.filter((l) => !/^time_limit:\s*\d+/i.test(l.trim()));
  textLines = textLines.filter((l) => !/^(?:type|question_type):\s*[a-z_]+$/i.test(l.trim()));
  textLines = textLines.filter((l) => !/^multi_select:\s*(true|false|yes|no|1|0)$/i.test(l.trim()));
  const liveEmbedExtraction = isSlide
    ? extractSlideLiveEmbed(textLines)
    : { contentLines: textLines, liveEmbed: undefined };
  textLines = liveEmbedExtraction.contentLines;
  const referenceExtraction = isSlide
    ? extractSlideReferences(textLines)
    : { contentLines: textLines, references: [] as SlideReference[] };
  textLines = referenceExtraction.contentLines;
  const noteExtraction = extractFoldoutNotes(textLines);
  textLines = noteExtraction.contentLines;
  const mediaExtraction = isSlide
    ? extractSlideMedia(textLines)
    : { contentLines: textLines, media: [] as SlideMedia[] };
  textLines = mediaExtraction.contentLines;
  const textMd = textLines.join("\n").trim();

  // 7. Render markdown to HTML
  const textHtml = renderMarkdown(textMd);

  // 8. Build options
  const options: QuestionOption[] = optionLines.map((o) => ({
    label: o.label,
    textMd: o.text,
    textHtml: renderMarkdown(o.text),
  }));

  return {
    index,
    topic,
    subtopic: subtopic || undefined,
    textMd,
    textHtml,
    questionType: normalizedQuestionType,
    attendeeNotes: noteExtraction.notes.filter((note) => note.audience === "attendee"),
    presenterNotes: noteExtraction.notes.filter((note) => note.audience === "presenter"),
    slideMedia: mediaExtraction.media.length > 0 ? mediaExtraction.media : undefined,
    slideLiveEmbed: liveEmbedExtraction.liveEmbed,
    slideReferences: referenceExtraction.references.length > 0 ? referenceExtraction.references : undefined,
    options,
    correctOptions,
    allowsMultiple,
    isPoll,
    explanation,
    timeLimitSec: isSlide ? 0 : timeLimitSec,
  };
}

function findLineNumber(lines: string[], blockStartLine: number, predicate: (line: string) => boolean): number {
  const index = lines.findIndex((line) => predicate(line.trim()));
  return index >= 0 ? blockStartLine + index : blockStartLine;
}

function findQuestionPromptLineNumber(lines: string[], blockStartLine: number, fallbackLineNumber: number): number {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (/^##\s+/.test(trimmed)) continue;
    if (/^(time_limit|type|question_type|multi_select):/i.test(trimmed)) continue;
    if (/^>/.test(trimmed)) continue;
    return blockStartLine + i;
  }

  return fallbackLineNumber;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resolveMarkdownImageHref(href: string): string {
  const normalizedHref = href.trim().replace(/\\/g, "/");
  const unwrappedHref = normalizedHref.startsWith("<") && normalizedHref.endsWith(">")
    ? normalizedHref.slice(1, -1)
    : normalizedHref;
  if (!unwrappedHref.startsWith(QUIZ_IMAGE_SOURCE_PREFIX)) {
    return unwrappedHref;
  }

  const relativePath = unwrappedHref.slice(QUIZ_IMAGE_SOURCE_PREFIX.length);
  const segments = relativePath.replace(/^\/+/, "").split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    return unwrappedHref;
  }

  return `${QUIZ_IMAGE_PUBLIC_PREFIX}${segments.join("/")}`;
}

function extractSlideLiveEmbed(lines: string[]): { contentLines: string[]; liveEmbed?: SlideLiveEmbed } {
  const contentLines: string[] = [];
  let url = "";
  let titleOverlay: boolean | undefined;
  let interactive: boolean | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(live_url|live_title_overlay|live_interactive):\s*(.+)$/i);
    if (!match) {
      contentLines.push(line);
      continue;
    }

    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (key === "live_url") {
      url = stripOptionalQuotes(value);
    } else if (key === "live_title_overlay") {
      titleOverlay = parseBooleanField(value);
    } else if (key === "live_interactive") {
      interactive = parseBooleanField(value);
    }
  }

  if (!url) {
    return { contentLines };
  }

  return {
    contentLines,
    liveEmbed: {
      url,
      ...(titleOverlay !== undefined ? { titleOverlay } : {}),
      ...(interactive !== undefined ? { interactive } : {}),
    },
  };
}

function extractSlideMedia(lines: string[]): { contentLines: string[]; media: SlideMedia[] } {
  const contentLines: string[] = [];
  const media: SlideMedia[] = [];

  for (const line of lines) {
    MARKDOWN_IMAGE_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    let strippedLine = line;
    let matchedLine = false;

    while ((match = MARKDOWN_IMAGE_REGEX.exec(line)) !== null) {
      matchedLine = true;
      const alt = match[1]?.trim() || "Slide image";
      const src = resolveMarkdownImageHref(match[2] || "");
      const title = match[3]?.trim();
      media.push({
        src,
        alt,
        ...(title ? { title } : {}),
      });
    }

    if (matchedLine) {
      strippedLine = strippedLine.replace(MARKDOWN_IMAGE_REGEX, "").trimEnd();
    }

    if (strippedLine.trim()) {
      contentLines.push(strippedLine);
    } else if (!matchedLine) {
      contentLines.push(line);
    }
  }

  return { contentLines, media };
}

function extractSlideReferences(lines: string[]): { contentLines: string[]; references: SlideReference[] } {
  const contentLines: string[] = [];
  const references: SlideReference[] = [];
  const referenceStart = /^\s*>\s*(References?|Sources?|Image\s+Sources?|Image\s+Credits?|Credits?):\s*(.*)$/i;

  for (const line of lines) {
    const match = line.match(referenceStart);
    if (!match) {
      contentLines.push(line);
      continue;
    }

    const textMd = match[2].trim();
    if (!textMd) {
      continue;
    }

    references.push({
      id: `reference-${references.length + 1}`,
      textMd,
      html: renderInlineMarkdown(textMd),
    });
  }

  return { contentLines, references };
}

function extractFoldoutNotes(lines: string[]): { contentLines: string[]; notes: FoldoutNote[] } {
  const contentLines: string[] = [];
  const notes: FoldoutNote[] = [];
  let currentNote: {
    audience: FoldoutNote["audience"];
    scope: FoldoutNote["scope"];
    title?: string;
    bodyLines: string[];
  } | null = null;
  let lastContentLine = "";

  const flushNote = () => {
    if (!currentNote) return;
    const bodyMd = currentNote.bodyLines.join("\n").trim();
    if (bodyMd) {
      notes.push({
        id: `note-${notes.length + 1}`,
        audience: currentNote.audience,
        scope: currentNote.scope,
        title: currentNote.title,
        bodyMd,
        bodyHtml: renderMarkdown(bodyMd),
      });
    }
    currentNote = null;
  };

  for (const line of lines) {
    const noteStart = line.match(/^\s*>\s*(Presenter|Attendee)\s+Note:\s*(.*)$/i);
    const noteContinuation = line.match(/^\s*>\s?(.*)$/);
    if (noteStart) {
      flushNote();
      currentNote = {
        audience: noteStart[1].toLowerCase() === "presenter" ? "presenter" : "attendee",
        scope: /^\s*[-*+]\s+/.test(lastContentLine) ? "bullet" : "section",
        bodyLines: [noteStart[2] || ""],
      };
      continue;
    }
    if (currentNote && noteContinuation) {
      currentNote.bodyLines.push(noteContinuation[1] || "");
      continue;
    }

    flushNote();
    contentLines.push(line);
    if (line.trim()) {
      lastContentLine = line;
    }
  }

  flushNote();
  return { contentLines, notes };
}

function parseBooleanField(value: string): boolean {
  return /^(true|yes|1)$/i.test(value.trim());
}

function extractOverallFeedback(lines: string[]): string {
  const feedbackStart = lines.findIndex((line) => /^>\s*Overall\s+Feedback:\s*/i.test(line));
  if (feedbackStart < 0) return "";

  const firstLine = lines[feedbackStart].replace(/^>\s*Overall\s+Feedback:\s*/i, "");
  const feedbackLines = [firstLine.trimEnd()];

  for (let i = feedbackStart + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const metadataMatch = line.match(/^>\s*([A-Za-z][A-Za-z\s]+):\s*/);
    if (metadataMatch) {
      const label = metadataMatch[1].replace(/\s+/g, " ").trim().toLowerCase();
      if (
        label === "correct answer" ||
        label === "correct answers" ||
        label === "overall feedback" ||
        label === "presenter note" ||
        label === "attendee note"
      ) {
        break;
      }
    }

    if (!/^>\s?/.test(line)) break;
    feedbackLines.push(line.replace(/^>\s?/, "").trimEnd());
  }

  return feedbackLines.join("\n").trim();
}

/** Render markdown to HTML using marked (synchronous) */
function createMarkdownRenderer() {
  const renderer = new marked.Renderer();
  renderer.image = (href: string, title: string | null, text: string): string => {
    const src = escapeHtml(resolveMarkdownImageHref(href));
    const alt = escapeHtml(text || "Quiz image");
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
    return `<img class="quiz-embedded-image" src="${src}" alt="${alt}"${titleAttr}>`;
  };
  return renderer;
}

function renderMarkdown(md: string): string {
  // marked.parse can return string | Promise<string> depending on config,
  // but with default (sync) config it returns string
  const result = marked.parse(md, { async: false, renderer: createMarkdownRenderer() }) as string;
  return result.trim();
}

function renderInlineMarkdown(md: string): string {
  const result = marked.parseInline(md, { async: false, renderer: createMarkdownRenderer() }) as string;
  return result.trim();
}
