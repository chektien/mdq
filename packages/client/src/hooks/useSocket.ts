import { io, type Socket } from "socket.io-client";
import { useState, useEffect, useCallback, useRef } from "react";
import type {
  SessionState,
  StudentJoinedPayload,
  QuestionOpenPayload,
  QuestionTickPayload,
  AnswerCountPayload,
  QuestionClosePayload,
  ResultsRevealPayload,
  ResultsDistributionPayload,
  LeaderboardUpdatePayload,
  SessionStatePayload,
  SessionParticipantsPayload,
  LeaderboardEntry,
} from "@md-quiz/shared";
import { SocketEvents } from "@md-quiz/shared";

// ── localStorage helpers ─────────────────────
const STORAGE_KEY = "mdquiz_session";

interface StoredSession {
  sessionId: string;
  studentId: string;
  sessionToken: string;
}

function loadStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveStoredSession(data: StoredSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function clearStoredSession() {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Socket state types ───────────────────────

export interface QuestionState {
  questionIndex: number;
  topic: string;
  text: string;
  options: { label: string; text: string }[];
  timeLimitSec: number;
  startedAt: number;
}

export interface RevealState {
  questionIndex: number;
  correctOptions: string[];
  explanation: string;
  distribution: Record<string, number>;
}

export interface UseSocketReturn {
  // Connection
  connected: boolean;
  error: string | null;

  // Session
  sessionState: SessionState | null;
  sessionToken: string | null;
  studentId: string | null;
  answeredQuestions: number[];

  // Question
  currentQuestion: QuestionState | null;
  remainingSec: number;
  answerCount: AnswerCountPayload | null;
  submitted: boolean;
  submittedOptions: string[];

  // Reveal
  reveal: RevealState | null;
  distribution: ResultsDistributionPayload | null;

  // Leaderboard
  leaderboard: LeaderboardEntry[];
  totalQuestions: number;

  // Participants
  participants: SessionParticipantsPayload | null;

  // Actions
  joinSession: (studentId: string, displayName?: string) => void;
  submitAnswer: (questionIndex: number, selectedOptions: string[]) => void;
  disconnect: () => void;
}

export function useSocket(sessionId: string | null, role: "student" | "instructor"): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [studentIdState, setStudentIdState] = useState<string | null>(null);
  const [answeredQuestions, setAnsweredQuestions] = useState<number[]>([]);

  const [currentQuestion, setCurrentQuestion] = useState<QuestionState | null>(null);
  const [remainingSec, setRemainingSec] = useState(0);
  const [answerCount, setAnswerCount] = useState<AnswerCountPayload | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submittedOptions, setSubmittedOptions] = useState<string[]>([]);

  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [distribution, setDistribution] = useState<ResultsDistributionPayload | null>(null);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [totalQuestions, setTotalQuestions] = useState(0);

  const [participants, setParticipants] = useState<SessionParticipantsPayload | null>(null);

  // Connect socket when sessionId is available
  useEffect(() => {
    if (!sessionId) return;

    const socket = io({
      auth: { sessionId, role },
      query: { sessionId },
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setError(null);

      // Auto-rejoin for students with stored token
      if (role === "student") {
        const stored = loadStoredSession();
        if (stored && stored.sessionId === sessionId && stored.sessionToken) {
          socket.emit(SocketEvents.STUDENT_JOIN, {
            studentId: stored.studentId,
            sessionToken: stored.sessionToken,
          });
        }
      }
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("connect_error", (err) => {
      setError(`Connection failed: ${err.message}`);
    });

    // ── Student join response ──────────────
    socket.on(SocketEvents.STUDENT_JOINED, (data: StudentJoinedPayload) => {
      setSessionToken(data.sessionToken);
      setStudentIdState(data.participantId);
      setSessionState(data.sessionState);
      setAnsweredQuestions(data.answeredQuestions || []);
      setError(null);

      // Persist for reconnection
      saveStoredSession({
        sessionId,
        studentId: data.participantId,
        sessionToken: data.sessionToken,
      });
    });

    socket.on(SocketEvents.STUDENT_REJECTED, (data: { reason: string }) => {
      setError(data.reason);
    });

    // ── Question lifecycle ─────────────────
    socket.on(SocketEvents.QUESTION_OPEN, (data: QuestionOpenPayload) => {
      setCurrentQuestion({
        questionIndex: data.questionIndex,
        topic: data.topic,
        text: data.text,
        options: data.options,
        timeLimitSec: data.timeLimitSec,
        startedAt: data.startedAt,
      });
      setSessionState("QUESTION_OPEN");
      setReveal(null);
      setDistribution(null);
      setSubmitted(false);
      setSubmittedOptions([]);
      setRemainingSec(data.timeLimitSec);
    });

    socket.on(SocketEvents.QUESTION_TICK, (data: QuestionTickPayload) => {
      setRemainingSec(data.remainingSec);
    });

    socket.on(SocketEvents.QUESTION_CLOSE, (_data: QuestionClosePayload) => {
      setSessionState("QUESTION_CLOSED");
      setRemainingSec(0);
    });

    socket.on(SocketEvents.ANSWER_ACCEPTED, (data: { questionIndex: number }) => {
      setSubmitted(true);
      setAnsweredQuestions(prev => [...prev, data.questionIndex]);
    });

    socket.on(SocketEvents.ANSWER_REJECTED, (data: { questionIndex: number; reason: string }) => {
      setError(`Answer rejected: ${data.reason}`);
      // Clear error after 3 seconds
      setTimeout(() => setError(null), 3000);
    });

    // ── Answer count (instructor) ─────────
    socket.on(SocketEvents.ANSWER_COUNT, (data: AnswerCountPayload) => {
      setAnswerCount(data);
    });

    // ── Results ───────────────────────────
    socket.on(SocketEvents.RESULTS_DISTRIBUTION, (data: ResultsDistributionPayload) => {
      setDistribution(data);
    });

    socket.on(SocketEvents.RESULTS_REVEAL, (data: ResultsRevealPayload) => {
      setReveal({
        questionIndex: data.questionIndex,
        correctOptions: data.correctOptions,
        explanation: data.explanation,
        distribution: data.distribution,
      });
      setSessionState("REVEAL");
    });

    // ── Leaderboard ───────────────────────
    socket.on(SocketEvents.LEADERBOARD_UPDATE, (data: LeaderboardUpdatePayload) => {
      setLeaderboard(data.entries);
      setTotalQuestions(data.totalQuestions);
      setSessionState("LEADERBOARD");
    });

    // ── Session state broadcasts ──────────
    socket.on(SocketEvents.SESSION_STATE, (data: SessionStatePayload) => {
      setSessionState(data.state);
    });

    // ── Participants (instructor) ─────────
    socket.on(SocketEvents.SESSION_PARTICIPANTS, (data: SessionParticipantsPayload) => {
      setParticipants(data);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionId, role]);

  const joinSession = useCallback(
    (studentId: string, displayName?: string) => {
      if (!socketRef.current) return;
      const stored = loadStoredSession();
      const token = stored?.sessionId === sessionId ? stored.sessionToken : undefined;
      socketRef.current.emit(SocketEvents.STUDENT_JOIN, {
        studentId: studentId.trim(),
        displayName: displayName?.trim() || undefined,
        sessionToken: token,
      });
      setStudentIdState(studentId.trim());
    },
    [sessionId],
  );

  const submitAnswer = useCallback(
    (questionIndex: number, selectedOptions: string[]) => {
      if (!socketRef.current) return;
      socketRef.current.emit(SocketEvents.ANSWER_SUBMIT, {
        questionIndex,
        selectedOptions,
      });
      setSubmittedOptions(selectedOptions);
    },
    [],
  );

  const disconnect = useCallback(() => {
    clearStoredSession();
    socketRef.current?.disconnect();
    setConnected(false);
    setSessionState(null);
    setSessionToken(null);
    setStudentIdState(null);
  }, []);

  return {
    connected,
    error,
    sessionState,
    sessionToken,
    studentId: studentIdState,
    answeredQuestions,
    currentQuestion,
    remainingSec,
    answerCount,
    submitted,
    submittedOptions,
    reveal,
    distribution,
    leaderboard,
    totalQuestions,
    participants,
    joinSession,
    submitAnswer,
    disconnect,
  };
}
