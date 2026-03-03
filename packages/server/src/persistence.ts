import * as fs from "fs";
import * as path from "path";
import {
  Session,
  SessionSnapshot,
  WeeklyResult,
  CumulativeLeaderboardEntry,
  Quiz,
  Submission,
  DATA_DIR,
} from "@mdq/shared";
import { computeLeaderboard } from "./session";

// ── Directory layout ───────────────────────

function resolveDataDir(baseDir?: string): string {
  return baseDir || path.resolve(process.cwd(), DATA_DIR);
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sessionsDir(baseDir?: string): string {
  return path.join(resolveDataDir(baseDir), "sessions");
}

function submissionsDir(baseDir?: string): string {
  return path.join(resolveDataDir(baseDir), "submissions");
}

function winnersDir(baseDir?: string): string {
  return path.join(resolveDataDir(baseDir), "winners");
}

// ── Session snapshot persistence ────────────

/**
 * Save a session snapshot to data/sessions/<sessionId>.json.
 * Called on session end.
 */
export function saveSessionSnapshot(session: Session, baseDir?: string): void {
  const dir = sessionsDir(baseDir);
  ensureDir(dir);

  const snapshot: SessionSnapshot = {
    sessionId: session.sessionId,
    sessionCode: session.sessionCode,
    week: session.week,
    mode: session.mode,
    questionCount: session.currentQuestionIndex + 1,
    participantCount: session.participants.size,
    participants: [...session.participants.values()].map((p) => ({
      studentId: p.studentId,
      displayName: p.displayName,
      joinedAt: p.joinedAt,
    })),
    createdAt: session.createdAt,
    endedAt: Date.now(),
  };

  const filePath = path.join(dir, `${session.sessionId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
}

// ── Submission persistence ──────────────────

/**
 * Save all submissions for a session to data/submissions/<sessionId>.json.
 */
export function saveSubmissions(session: Session, baseDir?: string): void {
  const dir = submissionsDir(baseDir);
  ensureDir(dir);

  const data = {
    sessionId: session.sessionId,
    week: session.week,
    submissionCount: session.submissions.length,
    submissions: session.submissions,
  };

  const filePath = path.join(dir, `${session.sessionId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function csvEscape(value: string | number | boolean): string {
  const raw = String(value);
  if (raw.includes(",") || raw.includes("\n") || raw.includes('"')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function isSubmissionCorrect(submission: Submission, correctOptions: string[]): boolean {
  return (
    submission.selectedOptions.length === correctOptions.length
    && submission.selectedOptions.every((opt) => correctOptions.includes(opt))
  );
}

/**
 * Save per-student quiz results as CSV to data/submissions/<sessionId>.csv.
 * Intended for attendance and lightweight spreadsheet workflows.
 */
export function saveResultsCsv(session: Session, quiz: Quiz, baseDir?: string): void {
  const dir = submissionsDir(baseDir);
  ensureDir(dir);

  const correctMap = new Map<number, string[]>();
  quiz.questions.forEach((q, i) => correctMap.set(i, q.correctOptions));
  const leaderboard = computeLeaderboard(session, correctMap);
  const boardMap = new Map(leaderboard.map((entry) => [entry.studentId, entry]));

  const submissionsByStudent = new Map<string, Map<number, Submission>>();
  for (const sub of session.submissions) {
    if (!submissionsByStudent.has(sub.studentId)) {
      submissionsByStudent.set(sub.studentId, new Map<number, Submission>());
    }
    submissionsByStudent.get(sub.studentId)!.set(sub.questionIndex, sub);
  }

  const headers = [
    "session_id",
    "session_code",
    "week",
    "student_id",
    "display_name",
    "joined_at_iso",
    "connected_at_end",
    "questions_answered",
    "correct_count",
    "total_time_ms",
    "attendance",
  ];

  for (let i = 0; i < quiz.questions.length; i++) {
    headers.push(`q${i + 1}_selected`);
    headers.push(`q${i + 1}_correct`);
    headers.push(`q${i + 1}_response_ms`);
  }

  const rows: string[] = [headers.join(",")];

  const participants = [...session.participants.values()].sort((a, b) => a.studentId.localeCompare(b.studentId));
  for (const participant of participants) {
    const subs = submissionsByStudent.get(participant.studentId) || new Map<number, Submission>();
    const stats = boardMap.get(participant.studentId);

    const row: (string | number | boolean)[] = [
      session.sessionId,
      session.sessionCode,
      session.week,
      participant.studentId,
      participant.displayName || "",
      new Date(participant.joinedAt).toISOString(),
      participant.connected,
      subs.size,
      stats?.correctCount ?? 0,
      stats?.totalTimeMs ?? 0,
      "present",
    ];

    for (let i = 0; i < quiz.questions.length; i++) {
      const sub = subs.get(i);
      if (!sub) {
        row.push("", "", "");
        continue;
      }
      row.push(sub.selectedOptions.join("|"));
      row.push(isSubmissionCorrect(sub, correctMap.get(i) || []) ? 1 : 0);
      row.push(sub.responseTimeMs);
    }

    rows.push(row.map(csvEscape).join(","));
  }

  const filePath = path.join(dir, `${session.sessionId}.csv`);
  fs.writeFileSync(filePath, `${rows.join("\n")}\n`, "utf-8");
}

// ── Weekly winners persistence ──────────────

/**
 * Save the per-week leaderboard to data/winners/weekNN.json.
 * If a file for this week already exists, it is overwritten
 * (the latest session for a given week wins).
 */
export function saveWeeklyResult(
  session: Session,
  quiz: Quiz,
  baseDir?: string,
): void {
  const dir = winnersDir(baseDir);
  ensureDir(dir);

  const correctMap = new Map<number, string[]>();
  quiz.questions.forEach((q, i) => correctMap.set(i, q.correctOptions));
  const entries = computeLeaderboard(session, correctMap);

  const result: WeeklyResult = {
    week: session.week,
    sessionId: session.sessionId,
    totalQuestions: quiz.questions.length,
    completedAt: Date.now(),
    entries,
  };

  const filePath = path.join(dir, `${session.week}.json`);
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2), "utf-8");
}

// ── Weekly result reading ───────────────────

/**
 * Load a single weekly result file.
 * Returns null if the file doesn't exist or is malformed.
 */
export function loadWeeklyResult(week: string, baseDir?: string): WeeklyResult | null {
  const filePath = path.join(winnersDir(baseDir), `${week}.json`);
  return readJsonSafe<WeeklyResult>(filePath);
}

/**
 * Load all weekly result files from data/winners/.
 * Skips malformed files with a warning.
 */
export function loadAllWeeklyResults(baseDir?: string): WeeklyResult[] {
  const dir = winnersDir(baseDir);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const results: WeeklyResult[] = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    const result = readJsonSafe<WeeklyResult>(filePath);
    if (
      result &&
      typeof result.week === "string" &&
      result.entries &&
      Array.isArray(result.entries)
    ) {
      // Sanitize entries: ensure numeric fields default to 0
      result.entries = result.entries
        .filter((e) => e && typeof e.studentId === "string")
        .map((e) => ({
          ...e,
          correctCount: typeof e.correctCount === "number" ? e.correctCount : 0,
          totalTimeMs: typeof e.totalTimeMs === "number" ? e.totalTimeMs : 0,
          rank: typeof e.rank === "number" ? e.rank : 0,
        }));
      results.push(result);
    } else {
      console.warn(`Skipping malformed weekly result file: ${file}`);
    }
  }

  return results;
}

// ── Cumulative leaderboard ──────────────────

/**
 * Compute the cumulative leaderboard from all weekly result files.
 * Dynamically derived at read-time, not precomputed.
 *
 * Ranking:
 *   1. Total correct answers (descending)
 *   2. Total response time for correct answers (ascending, lower is better)
 *   3. Deterministic tie-break: studentId lexicographic (ascending)
 */
export function computeCumulativeLeaderboard(
  baseDir?: string,
): CumulativeLeaderboardEntry[] {
  const weeklyResults = loadAllWeeklyResults(baseDir);
  return computeCumulativeFromResults(weeklyResults);
}

/**
 * Core cumulative computation from a list of weekly results.
 * Exported for testability.
 */
export function computeCumulativeFromResults(
  weeklyResults: WeeklyResult[],
): CumulativeLeaderboardEntry[] {
  const statsMap = new Map<
    string,
    {
      totalCorrect: number;
      totalTimeMs: number;
      weeksParticipated: number;
      displayName?: string;
    }
  >();

  for (const result of weeklyResults) {
    for (const entry of result.entries) {
      const existing = statsMap.get(entry.studentId);
      if (existing) {
        existing.totalCorrect += entry.correctCount;
        existing.totalTimeMs += entry.totalTimeMs;
        existing.weeksParticipated++;
        // Use latest displayName if provided
        if (entry.displayName) {
          existing.displayName = entry.displayName;
        }
      } else {
        statsMap.set(entry.studentId, {
          totalCorrect: entry.correctCount,
          totalTimeMs: entry.totalTimeMs,
          weeksParticipated: 1,
          displayName: entry.displayName,
        });
      }
    }
  }

  const entries: CumulativeLeaderboardEntry[] = [...statsMap.entries()]
    .map(([studentId, stats]) => ({
      rank: 0,
      studentId,
      displayName: stats.displayName,
      totalCorrect: stats.totalCorrect,
      totalTimeMs: stats.totalTimeMs,
      weeksParticipated: stats.weeksParticipated,
    }))
    .sort((a, b) => {
      // 1. Total correct descending
      if (b.totalCorrect !== a.totalCorrect) return b.totalCorrect - a.totalCorrect;
      // 2. Total time ascending (lower is better)
      if (a.totalTimeMs !== b.totalTimeMs) return a.totalTimeMs - b.totalTimeMs;
      // 3. Deterministic tie-break: studentId ascending
      return a.studentId.localeCompare(b.studentId);
    });

  // Assign ranks
  entries.forEach((entry, i) => {
    entry.rank = i + 1;
  });

  return entries;
}

// ── Persist all session data on end ─────────

/**
 * Persist all session data: snapshot, submissions, and weekly winners.
 * Called when session transitions to ENDED.
 */
export function persistSessionOnEnd(
  session: Session,
  quiz: Quiz,
  baseDir?: string,
): void {
  try {
    saveSessionSnapshot(session, baseDir);
  } catch (e) {
    console.error(`Failed to save session snapshot for ${session.sessionId}:`, e);
  }

  try {
    saveSubmissions(session, baseDir);
  } catch (e) {
    console.error(`Failed to save submissions for ${session.sessionId}:`, e);
  }

  try {
    saveResultsCsv(session, quiz, baseDir);
  } catch (e) {
    console.error(`Failed to save results CSV for ${session.sessionId}:`, e);
  }

  try {
    saveWeeklyResult(session, quiz, baseDir);
  } catch (e) {
    console.error(`Failed to save weekly result for ${session.week}:`, e);
  }
}

// ── Utility ─────────────────────────────────

/**
 * Safely read and parse a JSON file. Returns null on any error.
 */
function readJsonSafe<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
