import { API } from "@mdq/shared";
import type { AccessInfo } from "@mdq/shared";

const BASE = "";

function apiPath(template: string, params: Record<string, string> = {}): string {
  let path = template;
  for (const [key, value] of Object.entries(params)) {
    path = path.replace(`:${key}`, value);
  }
  return `${BASE}${path}`;
}

export interface QuizSummary {
  week: string;
  title: string;
  questionCount: number;
}

export interface CreateSessionResponse {
  sessionId: string;
  sessionCode: string;
  joinUrl: string;
  questionHeadings: string[];
}

export interface SessionRestoreResponse {
  sessionId: string;
  sessionCode: string;
  week: string;
  state: string;
  currentQuestionIndex: number;
  questionCount: number;
  questionHeadings: string[];
}

export interface PresentationSessionResponse {
  sessionId: string;
  sessionCode: string;
  week: string;
  state: string;
  questionCount: number;
  questionHeadings: string[];
  accessInfo: AccessInfo;
}

export interface InstructorSessionStatus {
  authenticated: boolean;
  configured: boolean;
}

export interface RuntimeClientConfig {
  theme?: "dark" | "light";
}

export async function fetchRuntimeClientConfig(): Promise<RuntimeClientConfig> {
  const res = await fetch("/api/runtime-config");
  if (!res.ok) throw new Error("Failed to fetch runtime config");
  return res.json();
}

export async function fetchInstructorSessionStatus(): Promise<InstructorSessionStatus> {
  const res = await fetch(apiPath(API.INSTRUCTOR_SESSION), { credentials: "same-origin" });
  if (!res.ok) throw new Error("Failed to verify instructor session");
  return res.json();
}

export async function loginInstructor(password: string): Promise<void> {
  const res = await fetch(apiPath(API.INSTRUCTOR_LOGIN), {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to log in as instructor");
  }
}

export async function fetchQuizzes(): Promise<QuizSummary[]> {
  const res = await fetch(apiPath(API.QUIZZES));
  if (!res.ok) throw new Error("Failed to fetch quizzes");
  return res.json();
}

export interface ReloadQuizzesResponse {
  loaded: number;
  quizzes: QuizSummary[];
}

export async function reloadQuizzes(): Promise<ReloadQuizzesResponse> {
  const res = await fetch(apiPath(API.QUIZZES_RELOAD), {
    method: "POST",
    credentials: "same-origin",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to reload quizzes");
  }
  return res.json();
}

export async function createSession(week: string, mode: string = "open"): Promise<CreateSessionResponse> {
  const res = await fetch(apiPath(API.SESSION_CREATE), {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ week, mode }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to create session");
  }
  return res.json();
}

async function sessionAction(sessionId: string, action: string): Promise<Record<string, unknown>> {
  const pathTemplate = (API as Record<string, string>)[`SESSION_${action.toUpperCase()}`];
  if (!pathTemplate) throw new Error(`Unknown action: ${action}`);
  const res = await fetch(apiPath(pathTemplate, { id: sessionId }), {
    method: "POST",
    credentials: "same-origin",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to ${action}`);
  }
  return res.json();
}

export async function startSession(sessionId: string) {
  return sessionAction(sessionId, "START");
}

export async function nextQuestion(sessionId: string) {
  return sessionAction(sessionId, "NEXT");
}

export async function closeQuestion(sessionId: string) {
  return sessionAction(sessionId, "CLOSE");
}

export async function revealAnswer(sessionId: string) {
  return sessionAction(sessionId, "REVEAL");
}

export async function endSession(sessionId: string) {
  return sessionAction(sessionId, "END");
}

export async function showLeaderboard(sessionId: string): Promise<Record<string, unknown>> {
  const res = await fetch(apiPath(API.SESSION_LEADERBOARD_SHOW, { id: sessionId }), {
    method: "POST",
    credentials: "same-origin",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to show leaderboard");
  }
  return res.json();
}

export async function hideLeaderboard(sessionId: string): Promise<Record<string, unknown>> {
  const res = await fetch(apiPath(API.SESSION_LEADERBOARD_HIDE, { id: sessionId }), {
    method: "POST",
    credentials: "same-origin",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to return to quiz");
  }
  return res.json();
}

export async function fetchLeaderboard(sessionId: string) {
  const res = await fetch(apiPath(API.SESSION_LEADERBOARD, { id: sessionId }));
  if (!res.ok) throw new Error("Failed to fetch leaderboard");
  return res.json();
}

export async function fetchAccessInfo(): Promise<AccessInfo> {
  const res = await fetch(apiPath(API.ACCESS_INFO));
  if (!res.ok) throw new Error("Failed to fetch access info");
  return res.json();
}

export async function fetchSessionAccessInfo(sessionId: string): Promise<AccessInfo> {
  const res = await fetch(apiPath(API.SESSION_ACCESS_INFO, { id: sessionId }), {
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error("Failed to fetch session access info");
  return res.json();
}

export async function fetchSessionStateForRestore(sessionId: string): Promise<SessionRestoreResponse> {
  const res = await fetch(apiPath(API.SESSION_STATE_RESTORE, { id: sessionId }), {
    credentials: "same-origin",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to restore session state");
  }
  return res.json();
}

export async function fetchPresentationSession(sessionId: string): Promise<PresentationSessionResponse> {
  const res = await fetch(apiPath(API.SESSION_PRESENTATION, { id: sessionId }));
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to load presentation session");
  }
  return res.json();
}
