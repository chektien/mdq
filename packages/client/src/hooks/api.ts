import { API } from "@mdq/shared";
import type { AccessInfo } from "@mdq/shared";

const BASE = "";
const INSTRUCTOR_KEY = (import.meta as { env?: { VITE_INSTRUCTOR_KEY?: string } }).env?.VITE_INSTRUCTOR_KEY || "";

function instructorHeaders(): Record<string, string> {
  return INSTRUCTOR_KEY ? { "x-instructor-key": INSTRUCTOR_KEY } : {};
}

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
    headers: instructorHeaders(),
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
    headers: { "Content-Type": "application/json", ...instructorHeaders() },
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
    headers: instructorHeaders(),
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
    headers: instructorHeaders(),
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
    headers: instructorHeaders(),
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
    headers: instructorHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch session access info");
  return res.json();
}
