import { Quiz, Question, QuestionOption, DEFAULT_TIME_LIMIT_SEC, QuestionType } from "@mdq/shared";
import { marked } from "marked";

const QUIZ_IMAGE_SOURCE_PREFIX = "../images/";
const QUIZ_IMAGE_PUBLIC_PREFIX = "/data/images/";

/** Error describing a problem in a specific question block */
export class QuizParseError extends Error {
  constructor(
    public readonly sourceFile: string,
    public readonly questionIndex: number,
    public readonly detail: string,
  ) {
    super(`[${sourceFile}] Question ${questionIndex + 1}: ${detail}`);
    this.name = "QuizParseError";
  }
}

/** Result of parsing, containing successfully parsed quiz and any validation errors */
export interface ParseResult {
  quiz: Quiz | null;
  errors: QuizParseError[];
}

/**
 * Parse a markdown quiz file into a Quiz object.
 * Follows PRD Section 8 parsing rules exactly.
 */
export function parseQuizMarkdown(markdown: string, sourceFile: string): ParseResult {
  const errors: QuizParseError[] = [];

  // Extract title from H1 heading
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : "";

  // Extract quiz key from filename (e.g., "week01.md" -> "week01", "week09-lab.md" -> "week09-lab")
  const sourceStem = sourceFile.replace(/^.*[\\/]/, "").replace(/\.md$/i, "").toLowerCase();
  const weekMatch = sourceStem.match(/^(week\d+(?:-[a-z0-9]+)*)$/i);
  const week = weekMatch ? weekMatch[1].toLowerCase() : sourceStem;

  // Split into question blocks by horizontal rules (---)
  // First, find where questions start (after title and any preamble)
  const sections = splitQuestionBlocks(markdown);

  const questions: Question[] = [];

  for (let i = 0; i < sections.length; i++) {
    const block = sections[i].trim();
    if (!block) continue;

    try {
      const question = parseQuestionBlock(block, i, sourceFile);
      questions.push(question);
    } catch (e) {
      if (e instanceof QuizParseError) {
        errors.push(e);
      } else {
        errors.push(new QuizParseError(sourceFile, i, `Unexpected error: ${e}`));
      }
    }
  }

  if (questions.length === 0 && errors.length === 0) {
    errors.push(new QuizParseError(sourceFile, -1, "No questions found in file"));
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
function splitQuestionBlocks(markdown: string): string[] {
  // Stop parsing at "## Learning Objectives" per PRD rule 10
  const stopIdx = markdown.search(/^##\s+Learning\s+Objectives/mi);
  const content = stopIdx >= 0 ? markdown.substring(0, stopIdx) : markdown;

  // Split on horizontal rules (--- on its own line)
  const rawBlocks = content.split(/^---+\s*$/m);

  // Filter to blocks containing an H2 heading (question blocks)
  return rawBlocks.filter((block) => /^##\s+/m.test(block));
}

/**
 * Parse a single question block into a Question object.
 */
function parseQuestionBlock(block: string, index: number, sourceFile: string): Question {
  const lines = block.split("\n");

  // 1. Extract topic from H2 heading
  const h2Match = block.match(/^##\s+(.+)$/m);
  if (!h2Match) {
    throw new QuizParseError(sourceFile, index, "Missing H2 topic heading");
  }
  const topicRaw = h2Match[1].trim();
  const colonIdx = topicRaw.indexOf(":");
  const topic = colonIdx >= 0 ? topicRaw.substring(0, colonIdx).trim() : topicRaw;
  const subtopic = colonIdx >= 0 ? topicRaw.substring(colonIdx + 1).trim() : undefined;

  // 2. Extract time_limit (optional, after H2, before question text)
  let timeLimitSec = DEFAULT_TIME_LIMIT_SEC;
  const timeLimitMatch = block.match(/^time_limit:\s*(\d+)\s*$/m);
  if (timeLimitMatch) {
    timeLimitSec = parseInt(timeLimitMatch[1], 10);
    if (timeLimitSec <= 0) {
      throw new QuizParseError(sourceFile, index, `Invalid time_limit: ${timeLimitMatch[1]} (must be positive)`);
    }
  }

  const questionTypeMatch = block.match(/^question_type:\s*([a-z_]+)\s*$/im);
  const questionType = questionTypeMatch?.[1].trim().toLowerCase() as QuestionType | undefined;
  if (questionType && questionType !== "poll" && questionType !== "open_response") {
    throw new QuizParseError(sourceFile, index, `Unsupported question_type: ${questionType}`);
  }
  const normalizedQuestionType: QuestionType = questionType || "multiple_choice";
  const isPoll = normalizedQuestionType === "poll";
  const isOpenResponse = normalizedQuestionType === "open_response";

  const multiSelectMatch = block.match(/^multi_select:\s*(true|false|yes|no|1|0)\s*$/im);
  if (isOpenResponse && multiSelectMatch) {
    throw new QuizParseError(sourceFile, index, "open_response questions must not use multi_select");
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

  if (isOpenResponse && optionLines.length > 0) {
    throw new QuizParseError(sourceFile, index, "open_response questions must not define answer options");
  }

  if (!isOpenResponse && optionLines.length === 0) {
    throw new QuizParseError(sourceFile, index, "No answer options found (expected A., B., C., ...)");
  }

  // 4. Extract correct answer(s) from blockquote
  const correctSingleMatch = block.match(/^>\s*Correct\s+Answer:\s*([A-Z])[.\s]*/m);
  const correctMultiMatch = block.match(/^>\s*Correct\s+Answers:\s*(.+)$/m);

  let correctOptions: string[];
  if (isOpenResponse) {
    if (correctSingleMatch || correctMultiMatch) {
      throw new QuizParseError(sourceFile, index, "open_response questions must not define correct answers");
    }
    correctOptions = [];
  } else if (isPoll) {
    if (correctSingleMatch || correctMultiMatch) {
      throw new QuizParseError(sourceFile, index, "Poll questions must not define correct answers");
    }
    correctOptions = [];
  } else if (correctMultiMatch) {
    correctOptions = correctMultiMatch[1].split(",").map((s) => s.trim().charAt(0));
  } else if (correctSingleMatch) {
    correctOptions = [correctSingleMatch[1]];
  } else {
    throw new QuizParseError(sourceFile, index, "Missing correct answer line (expected '> Correct Answer: X' or '> Correct Answers: X, Y')");
  }

  // Validate correct options reference existing labels
  const validLabels = new Set(optionLines.map((o) => o.label));
  for (const opt of correctOptions) {
    if (!validLabels.has(opt)) {
      throw new QuizParseError(sourceFile, index, `Correct answer "${opt}" does not match any option label (${[...validLabels].join(", ")})`);
    }
  }

  const allowsMultiple = isOpenResponse
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
    );
  }

  // 5. Extract explanation from blockquote
  const feedbackMatch = block.match(/^>\s*Overall\s+Feedback:\s*(.+)$/m);
  const explanation = feedbackMatch ? feedbackMatch[1].trim() : "";

  // 6. Extract question text (between H2/time_limit and first option)
  const h2LineIdx = lines.findIndex((l) => /^##\s+/.test(l));
  const firstOptionLineIdx = optionLines[0]?.lineIndex ?? Number.POSITIVE_INFINITY;
  const firstBlockquoteLineIdx = lines.findIndex((line) => /^>\s*/.test(line.trim()));
  const contentEndLineIdx = Math.min(
    firstOptionLineIdx,
    firstBlockquoteLineIdx >= 0 ? firstBlockquoteLineIdx : Number.POSITIVE_INFINITY,
    lines.length,
  );

  let textLines = lines.slice(h2LineIdx + 1, contentEndLineIdx);
  // Remove time_limit line from text
  textLines = textLines.filter((l) => !/^time_limit:\s*\d+/i.test(l.trim()));
  textLines = textLines.filter((l) => !/^question_type:\s*[a-z_]+$/i.test(l.trim()));
  textLines = textLines.filter((l) => !/^multi_select:\s*(true|false|yes|no|1|0)$/i.test(l.trim()));
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
    options,
    correctOptions,
    allowsMultiple,
    isPoll,
    explanation,
    timeLimitSec,
  };
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
  if (!normalizedHref.startsWith(QUIZ_IMAGE_SOURCE_PREFIX)) {
    return normalizedHref;
  }

  const relativePath = normalizedHref.slice(QUIZ_IMAGE_SOURCE_PREFIX.length);
  const segments = relativePath.replace(/^\/+/, "").split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    return normalizedHref;
  }

  return `${QUIZ_IMAGE_PUBLIC_PREFIX}${segments.join("/")}`;
}

function parseBooleanField(value: string): boolean {
  return /^(true|yes|1)$/i.test(value.trim());
}

/** Render markdown to HTML using marked (synchronous) */
function renderMarkdown(md: string): string {
  const renderer = new marked.Renderer();
  renderer.image = (href: string, title: string | null, text: string): string => {
    const src = escapeHtml(resolveMarkdownImageHref(href));
    const alt = escapeHtml(text || "Quiz image");
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
    return `<img class="quiz-embedded-image" src="${src}" alt="${alt}"${titleAttr}>`;
  };

  // marked.parse can return string | Promise<string> depending on config,
  // but with default (sync) config it returns string
  const result = marked.parse(md, { async: false, renderer }) as string;
  return result.trim();
}
