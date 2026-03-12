// ──────────────────────────────────────────────
// mdq shared contracts
// Single source of truth for types, events, REST
// paths, and session state transitions.
// ──────────────────────────────────────────────

// ── Session States ──────────────────────────
export const SESSION_STATES = [
  "LOBBY",
  "QUESTION_OPEN",
  "QUESTION_CLOSED",
  "REVEAL",
  "LEADERBOARD",
  "ENDED",
] as const;

export type SessionState = (typeof SESSION_STATES)[number];

/**
 * Valid state transitions. Key = current state, value = set of allowed next states.
 * Transitions are instructor-controlled except QUESTION_OPEN -> QUESTION_CLOSED
 * which also happens automatically when the timer expires.
 */
export const STATE_TRANSITIONS: Record<SessionState, readonly SessionState[]> = {
  LOBBY: ["QUESTION_OPEN"],
  QUESTION_OPEN: ["QUESTION_CLOSED"],
  QUESTION_CLOSED: ["REVEAL"],
  REVEAL: ["QUESTION_OPEN", "LEADERBOARD"],
  LEADERBOARD: ["REVEAL", "ENDED"],
  ENDED: [],
};

// ── Socket.IO Event Names ───────────────────
export const SocketEvents = {
  // Client -> Server
  STUDENT_JOIN: "student:join",
  ANSWER_SUBMIT: "answer:submit",

  // Server -> Client (targeted)
  STUDENT_JOINED: "student:joined",
  STUDENT_REJECTED: "student:rejected",
  ANSWER_ACCEPTED: "answer:accepted",
  ANSWER_REJECTED: "answer:rejected",

  // Server -> Instructor
  SESSION_PARTICIPANTS: "session:participants",
  ANSWER_COUNT: "answer:count",
  RESULTS_DISTRIBUTION: "results:distribution",

  // Server -> All
  QUESTION_OPEN: "question:open",
  QUESTION_TICK: "question:tick",
  QUESTION_CLOSE: "question:close",
  RESULTS_REVEAL: "results:reveal",
  LEADERBOARD_UPDATE: "leaderboard:update",
  SESSION_STATE: "session:state",
} as const;

// ── Socket.IO Payload Types ─────────────────

export interface StudentJoinPayload {
  studentId: string;
  displayName?: string;
  sessionToken?: string;
  clientInstanceId?: string;
}

export interface StudentJoinedPayload {
  participantId: string;
  sessionToken: string;
  sessionState: SessionState;
  currentQuestion?: number;
  answeredQuestions?: number[]; // question indices already answered
}

export interface StudentRejectedPayload {
  reason: string;
}

export interface QuestionOpenPayload {
  questionIndex: number;
  topic: string;
  text: string; // rendered HTML
  options: { label: string; text: string }[];
  allowsMultiple: boolean;
  timeLimitSec: number;
  startedAt: number; // unix ms
}

export interface QuestionTickPayload {
  remainingSec: number;
}

export interface AnswerSubmitPayload {
  questionIndex: number;
  selectedOptions: string[];
}

export interface AnswerAcceptedPayload {
  questionIndex: number;
}

export interface AnswerRejectedPayload {
  questionIndex: number;
  reason: string;
}

export interface AnswerCountPayload {
  questionIndex: number;
  submitted: number;
  total: number;
}

export interface QuestionClosePayload {
  questionIndex: number;
}

export interface ResultsDistributionPayload {
  questionIndex: number;
  distribution: Record<string, number>;
}

export interface ResultsRevealPayload {
  questionIndex: number;
  correctOptions: string[];
  explanation: string;
  distribution: Record<string, number>;
}

export interface LeaderboardEntry {
  rank: number;
  studentId: string;
  displayName?: string;
  correctCount: number;
  totalTimeMs: number;
}

export interface LeaderboardUpdatePayload {
  entries: LeaderboardEntry[];
  totalQuestions: number;
}

export interface SessionStatePayload {
  state: SessionState;
  questionIndex?: number;
}

export interface SessionParticipantsPayload {
  count: number;
  participants: { studentId: string; displayName?: string }[];
}

// ── REST API Paths ──────────────────────────
export const API = {
  HEALTH: "/api/health",
  INSTRUCTOR_LOGIN: "/api/instructor/login",
  INSTRUCTOR_SESSION: "/api/instructor/session",
  INSTRUCTOR_LOGOUT: "/api/instructor/logout",
  QUIZZES: "/api/quizzes",
  QUIZZES_RELOAD: "/api/quizzes/reload",
  QUIZ: "/api/quiz/:week",
  SESSION_CREATE: "/api/session",
  SESSION_START: "/api/session/:id/start",
  SESSION_NEXT: "/api/session/:id/next",
  SESSION_CLOSE: "/api/session/:id/close",
  SESSION_REVEAL: "/api/session/:id/reveal",
  SESSION_END: "/api/session/:id/end",
  SESSION_LEADERBOARD: "/api/session/:id/leaderboard",
  SESSION_LEADERBOARD_SHOW: "/api/session/:id/leaderboard-show",
  SESSION_LEADERBOARD_HIDE: "/api/session/:id/leaderboard-hide",
  SESSION_STATE_RESTORE: "/api/session/:id/state",
  SESSION_ACCESS_INFO: "/api/session/:id/access-info",
  SESSION_BY_CODE: "/api/session/by-code/:code",
  ACCESS_INFO: "/api/access-info",
  QR_CODE: "/api/qr/:sessionId.png",
  CUMULATIVE_LEADERBOARD: "/api/leaderboard/cumulative",
} as const;

// ── Data Model Types ────────────────────────

export interface QuestionOption {
  label: string;
  textMd: string;
  textHtml: string;
}

export interface Question {
  index: number;
  topic: string;
  subtopic?: string;
  textMd: string;
  textHtml: string;
  options: QuestionOption[];
  correctOptions: string[];
  allowsMultiple: boolean;
  explanation: string;
  timeLimitSec: number;
}

export interface Quiz {
  week: string;
  title: string;
  questions: Question[];
  sourceFile: string;
}

export type SessionMode = "strict" | "open";

export interface Participant {
  studentId: string;
  displayName?: string;
  sessionToken: string;
  clientInstanceId?: string;
  socketId: string;
  joinedAt: number;
  connected: boolean;
}

export interface Submission {
  studentId: string;
  questionIndex: number;
  selectedOptions: string[];
  submittedAt: number;
  responseTimeMs: number;
}

export interface Session {
  sessionId: string;
  sessionCode: string;
  week: string;
  mode: SessionMode;
  state: SessionState;
  currentQuestionIndex: number;
  questionStartedAt?: number;
  participants: Map<string, Participant>;
  submissions: Submission[];
  createdAt: number;
}

// ── Persistence Types ───────────────────────

/** Snapshot of a session written to data/sessions/<id>.json on session end */
export interface SessionSnapshot {
  sessionId: string;
  sessionCode: string;
  week: string;
  mode: SessionMode;
  questionCount: number;
  participantCount: number;
  participants: { studentId: string; displayName?: string; joinedAt: number }[];
  createdAt: number;
  endedAt: number;
}

/** Per-week leaderboard results written to data/winners/weekNN.json */
export interface WeeklyResult {
  week: string;
  sessionId: string;
  totalQuestions: number;
  completedAt: number;
  entries: LeaderboardEntry[];
}

/** Cumulative leaderboard entry derived from all weekly results */
export interface CumulativeLeaderboardEntry {
  rank: number;
  studentId: string;
  displayName?: string;
  totalCorrect: number;
  totalTimeMs: number;
  weeksParticipated: number;
}

/** Access info returned by /api/access-info */
export interface AccessInfo {
  fullUrl: string;
  shortUrl: string;
  qrCodeDataUrl: string;
  qrTargetUrl: string;
  source: "tailscale" | "lan-fallback";
  warning?: string;
  detectedAt: number;
}

// ── REST API Paths (additional) ─────────────
// (The API object above includes ACCESS_INFO and QR_CODE already)

// ── Constants ───────────────────────────────
export const DEFAULT_TIME_LIMIT_SEC = 35;
export const SESSION_CODE_LENGTH = 6;
export const DEFAULT_PORT = 3000;
export const TICK_INTERVAL_MS = 1000;
export const DATA_DIR = "data";
