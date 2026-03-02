import { API } from "@md-quiz/shared";
import type { AccessInfo } from "@md-quiz/shared";

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
}

export async function fetchQuizzes(): Promise<QuizSummary[]> {
  const res = await fetch(apiPath(API.QUIZZES));
  if (!res.ok) throw new Error("Failed to fetch quizzes");
  return res.json();
}

export async function createSession(week: string, mode: string = "open"): Promise<CreateSessionResponse> {
  const res = await fetch(apiPath(API.SESSION_CREATE), {
    method: "POST",
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
  const res = await fetch(`/api/session/${sessionId}/leaderboard-show`, {
    method: "POST",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to show leaderboard");
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
