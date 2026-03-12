import {
  Session,
  SessionState,
  SessionMode,
  Participant,
  Submission,
  STATE_TRANSITIONS,
  SESSION_CODE_LENGTH,
} from "@mdq/shared";
import { v4 as uuidv4 } from "uuid";

/** Error for invalid state transitions */
export class StateTransitionError extends Error {
  constructor(
    public readonly from: SessionState,
    public readonly to: SessionState,
  ) {
    super(`Invalid transition: ${from} -> ${to}. Allowed: [${STATE_TRANSITIONS[from].join(", ")}]`);
    this.name = "StateTransitionError";
  }
}

/** Generate a random alphanumeric session code */
function generateSessionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1 to avoid confusion
  let code = "";
  for (let i = 0; i < SESSION_CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/** Create a new Session in LOBBY state */
export function createSession(week: string, mode: SessionMode): Session {
  return {
    sessionId: uuidv4(),
    sessionCode: generateSessionCode(),
    week,
    mode,
    state: "LOBBY",
    currentQuestionIndex: -1,
    participants: new Map<string, Participant>(),
    submissions: [],
    createdAt: Date.now(),
  };
}

/**
 * Transition a session to the next state.
 * Throws StateTransitionError if the transition is invalid.
 */
export function transitionState(session: Session, to: SessionState): void {
  const allowed = STATE_TRANSITIONS[session.state];
  if (!allowed.includes(to)) {
    throw new StateTransitionError(session.state, to);
  }
  session.state = to;
}

/**
 * Add a participant to the session.
 * Returns the participant and whether this is a reconnection.
 */
export function addParticipant(
  session: Session,
  studentId: string,
  socketId: string,
  displayName?: string,
  sessionToken?: string,
  clientInstanceId?: string,
): { participant: Participant; isReconnect: boolean } {
  const existing = session.participants.get(studentId);

  if (existing) {
    // Reconnect attempt: validate token
    if (sessionToken && sessionToken === existing.sessionToken) {
      // Valid reconnect
      existing.socketId = socketId;
      existing.connected = true;
      if (displayName) {
        existing.displayName = displayName;
      }
      if (clientInstanceId) {
        existing.clientInstanceId = clientInstanceId;
      }
      return { participant: existing, isReconnect: true };
    }

    // Token-less reconnect fallback for same browser client only.
    // This supports page-close/QR-rescan rejoin while blocking ID takeover.
    if (
      !existing.connected
      && clientInstanceId
      && existing.clientInstanceId
      && clientInstanceId === existing.clientInstanceId
    ) {
      existing.socketId = socketId;
      existing.connected = true;
      if (displayName) {
        existing.displayName = displayName;
      }
      return { participant: existing, isReconnect: true };
    }

    // Different token or no token: conflict
    throw new Error(
      `Student ID "${studentId}" is already in use with a different session token.`,
    );
  }

  // New participant
  const participant: Participant = {
    studentId,
    displayName,
    sessionToken: uuidv4(),
    clientInstanceId,
    socketId,
    joinedAt: Date.now(),
    connected: true,
  };
  session.participants.set(studentId, participant);
  return { participant, isReconnect: false };
}

/**
 * Record a submission. Returns true if accepted, throws if rejected.
 */
export function recordSubmission(
  session: Session,
  studentId: string,
  questionIndex: number,
  selectedOptions: string[],
): Submission {
  const normalizedSelectedOptions = normalizeOptionSet(selectedOptions);

  if (session.state !== "QUESTION_OPEN") {
    throw new Error("Submissions only accepted during QUESTION_OPEN state.");
  }
  if (questionIndex !== session.currentQuestionIndex) {
    throw new Error(
      `Question index mismatch: expected ${session.currentQuestionIndex}, got ${questionIndex}.`,
    );
  }
  if (!normalizedSelectedOptions || normalizedSelectedOptions.length === 0) {
    throw new Error("At least one option must be selected.");
  }
  if (!session.participants.has(studentId)) {
    throw new Error(`Student "${studentId}" is not a participant in this session.`);
  }

  // Check for duplicate submission
  const alreadySubmitted = session.submissions.some(
    (s) => s.studentId === studentId && s.questionIndex === questionIndex,
  );
  if (alreadySubmitted) {
    throw new Error("Already submitted an answer for this question.");
  }

  const now = Date.now();
  const submission: Submission = {
    studentId,
    questionIndex,
    selectedOptions: normalizedSelectedOptions,
    submittedAt: now,
    responseTimeMs: session.questionStartedAt ? now - session.questionStartedAt : 0,
  };
  session.submissions.push(submission);
  return submission;
}

/**
 * Get the answer distribution for a question.
 */
export function getDistribution(
  session: Session,
  questionIndex: number,
): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const sub of session.submissions) {
    if (sub.questionIndex === questionIndex) {
      for (const opt of sub.selectedOptions) {
        dist[opt] = (dist[opt] || 0) + 1;
      }
    }
  }
  return dist;
}

/**
 * Get the submission count for a question.
 */
export function getSubmissionCount(
  session: Session,
  questionIndex: number,
): { submitted: number; total: number } {
  const submitted = session.submissions.filter(
    (s) => s.questionIndex === questionIndex,
  ).length;
  const total = countConnectedParticipants(session);
  return { submitted, total };
}

/**
 * Count connected participants.
 */
export function countConnectedParticipants(session: Session): number {
  let count = 0;
  for (const p of session.participants.values()) {
    if (p.connected) count++;
  }
  return count;
}

/**
 * Get questions answered by a specific student.
 */
export function getAnsweredQuestions(session: Session, studentId: string): number[] {
  return session.submissions
    .filter((s) => s.studentId === studentId)
    .map((s) => s.questionIndex);
}

function normalizeOptionSet(options: string[]): string[] {
  return [...new Set(options)].sort();
}

export function isExactOptionMatch(selectedOptions: string[], correctOptions: string[]): boolean {
  const selected = normalizeOptionSet(selectedOptions);
  const correct = normalizeOptionSet(correctOptions);

  return selected.length === correct.length && selected.every((option, index) => option === correct[index]);
}

/**
 * Compute leaderboard for a session given correct answers per question.
 */
export function computeLeaderboard(
  session: Session,
  correctAnswersMap: Map<number, string[]>,
): { rank: number; studentId: string; displayName?: string; correctCount: number; totalTimeMs: number }[] {
  const studentStats = new Map<
    string,
    { correctCount: number; totalTimeMs: number; displayName?: string }
  >();

  // Initialize all participants
  for (const [studentId, participant] of session.participants) {
    studentStats.set(studentId, {
      correctCount: 0,
      totalTimeMs: 0,
      displayName: participant.displayName,
    });
  }

  // Tally correct answers and times
  for (const sub of session.submissions) {
    const correct = correctAnswersMap.get(sub.questionIndex);
    if (!correct) continue;

    const stats = studentStats.get(sub.studentId);
    if (!stats) continue;

    const isCorrect = isExactOptionMatch(sub.selectedOptions, correct);

    if (isCorrect) {
      stats.correctCount++;
      stats.totalTimeMs += sub.responseTimeMs;
    }
  }

  // Sort: correct count desc, then total time asc, then studentId asc (deterministic tie-break)
  const entries = [...studentStats.entries()]
    .map(([studentId, stats]) => ({
      rank: 0,
      studentId,
      displayName: stats.displayName,
      correctCount: stats.correctCount,
      totalTimeMs: stats.totalTimeMs,
    }))
    .sort((a, b) => {
      if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
      if (a.totalTimeMs !== b.totalTimeMs) return a.totalTimeMs - b.totalTimeMs;
      return a.studentId.localeCompare(b.studentId);
    });

  // Assign ranks
  entries.forEach((entry, i) => {
    entry.rank = i + 1;
  });

  return entries;
}

// ── In-memory session store ─────────────────

const sessionStore = new Map<string, Session>();
const sessionCodeIndex = new Map<string, string>(); // code -> sessionId

export function storeSession(session: Session): void {
  sessionStore.set(session.sessionId, session);
  sessionCodeIndex.set(session.sessionCode, session.sessionId);
}

export function getSession(sessionId: string): Session | undefined {
  return sessionStore.get(sessionId);
}

export function getSessionByCode(code: string): Session | undefined {
  const id = sessionCodeIndex.get(code);
  return id ? sessionStore.get(id) : undefined;
}

export function clearAllSessions(): void {
  sessionStore.clear();
  sessionCodeIndex.clear();
}
