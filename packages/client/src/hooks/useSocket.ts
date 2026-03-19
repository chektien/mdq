import { io, type Socket } from "socket.io-client";
import { useState, useEffect, useCallback, useRef } from "react";
import type {
  SessionState,
  StudentJoinedPayload,
  QuestionOpenPayload,
  QuestionTickPayload,
  AnswerCountPayload,
  ResultsRevealPayload,
  ResultsDistributionPayload,
  LeaderboardUpdatePayload,
  SessionStatePayload,
  SessionParticipantsPayload,
  LeaderboardEntry,
  QuestionType,
  OpenResponseEntry,
  AnswerSubmitPayload,
} from "@mdq/shared";
import { SocketEvents } from "@mdq/shared";

// ── localStorage helpers ─────────────────────
const STORAGE_KEY = "mdquiz_session";
const CLIENT_INSTANCE_KEY = "mdquiz_client_instance_id";

interface StoredSession {
  sessionId: string;
  studentId: string;
  sessionToken: string;
}

function appendAnsweredQuestion(current: number[], questionIndex: number): number[] {
  return current.includes(questionIndex) ? current : [...current, questionIndex];
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

function getClientInstanceId(): string {
  const existing = localStorage.getItem(CLIENT_INSTANCE_KEY);
  if (existing) {
    return existing;
  }
  const generated =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(CLIENT_INSTANCE_KEY, generated);
  return generated;
}

// ── Socket state types ───────────────────────

export interface QuestionState {
  questionIndex: number;
  topic: string;
  text: string;
  questionType: QuestionType;
  options: { label: string; text: string }[];
  allowsMultiple: boolean;
  isPoll: boolean;
  timeLimitSec: number;
  startedAt: number;
}

export interface RevealState {
  questionIndex: number;
  questionType: QuestionType;
  correctOptions: string[];
  explanation: string;
  distribution: Record<string, number>;
  isPoll: boolean;
  openResponses: OpenResponseEntry[];
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
  submittedResponseText: string | null;

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
  submitAnswer: (payload: AnswerSubmitPayload) => void;
  disconnect: () => void;
}

export function useSocket(
  sessionId: string | null,
  role: "student" | "instructor" | "presentation",
): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const answeredQuestionsRef = useRef<number[]>([]);
  const currentQuestionRef = useRef<QuestionState | null>(null);
  const studentIdRef = useRef<string | null>(null);
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
  const [submittedResponseText, setSubmittedResponseText] = useState<string | null>(null);

  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [distribution, setDistribution] = useState<ResultsDistributionPayload | null>(null);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [totalQuestions, setTotalQuestions] = useState(0);

  const [participants, setParticipants] = useState<SessionParticipantsPayload | null>(null);

  useEffect(() => {
    currentQuestionRef.current = currentQuestion;
  }, [currentQuestion]);

  useEffect(() => {
    studentIdRef.current = studentIdState;
  }, [studentIdState]);

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
            clientInstanceId: getClientInstanceId(),
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
      answeredQuestionsRef.current = data.answeredQuestions || [];
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
      const reason = data.reason.toLowerCase();
      if (reason.includes("ended") || reason.includes("not found")) {
        clearStoredSession();
      }
    });

    // ── Question lifecycle ─────────────────
    socket.on(SocketEvents.QUESTION_OPEN, (data: QuestionOpenPayload) => {
      const questionType = data.questionType ?? (data.isPoll ? "poll" : "multiple_choice");
      setCurrentQuestion({
        questionIndex: data.questionIndex,
        topic: data.topic,
        text: data.text,
        questionType,
        options: data.options,
        allowsMultiple: data.allowsMultiple,
        isPoll: data.isPoll ?? false,
        timeLimitSec: data.timeLimitSec,
        startedAt: data.startedAt,
      });
      setSessionState("QUESTION_OPEN");
      setReveal(null);
      setDistribution(null);
      // Preserve submitted=true if this question was already answered (reconnect case)
      const alreadyAnswered = answeredQuestionsRef.current.includes(data.questionIndex);
      setSubmitted(questionType === "open_response" ? false : alreadyAnswered);
      setSubmittedOptions([]);
      setSubmittedResponseText(null);
      setRemainingSec(data.timeLimitSec);
    });

    socket.on(SocketEvents.QUESTION_TICK, (data: QuestionTickPayload) => {
      setRemainingSec(data.remainingSec);
    });

    socket.on(SocketEvents.QUESTION_CLOSE, () => {
      setSessionState("QUESTION_CLOSED");
      setRemainingSec(0);
    });

    socket.on(SocketEvents.ANSWER_ACCEPTED, (data: { questionIndex: number }) => {
      setSubmitted(true);
      setAnsweredQuestions(prev => {
        const next = appendAnsweredQuestion(prev, data.questionIndex);
        answeredQuestionsRef.current = next;
        return next;
      });
    });

    socket.on(SocketEvents.ANSWER_REJECTED, (data: { questionIndex: number; reason: string }) => {
      setError(`Answer rejected: ${data.reason}`);
      // Clear error after 3 seconds
      setTimeout(() => setError(null), 3000);
    });

    // ── Answer count (instructor) ─────────
    socket.on(SocketEvents.ANSWER_COUNT, (data: AnswerCountPayload) => {
      setAnswerCount(data);
      setAnsweredQuestions((prev) => {
        const current = currentQuestionRef.current;
        const participantId = studentIdRef.current;
        if (
          !participantId
          || !current
          || current.questionType !== "open_response"
          || current.questionIndex !== data.questionIndex
        ) {
          return prev;
        }

        const ownResponse = data.openResponses?.find((entry) => entry.studentId === participantId);
        if (!ownResponse) {
          return prev;
        }

        setSubmitted(true);
        setSubmittedResponseText(ownResponse.responseText);

        const next = appendAnsweredQuestion(prev, data.questionIndex);
        answeredQuestionsRef.current = next;
        return next;
      });
    });

    // ── Results ───────────────────────────
    socket.on(SocketEvents.RESULTS_DISTRIBUTION, (data: ResultsDistributionPayload) => {
      setDistribution(data);
    });

    socket.on(SocketEvents.RESULTS_REVEAL, (data: ResultsRevealPayload) => {
      setReveal({
        questionIndex: data.questionIndex,
        questionType: data.questionType ?? (data.isPoll ? "poll" : "multiple_choice"),
        correctOptions: data.correctOptions,
        explanation: data.explanation,
        distribution: data.distribution,
        isPoll: data.isPoll ?? false,
        openResponses: data.openResponses ?? [],
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
        clientInstanceId: getClientInstanceId(),
      });
      setStudentIdState(studentId.trim());
    },
    [sessionId],
  );

  const submitAnswer = useCallback(
    (payload: AnswerSubmitPayload) => {
      if (!socketRef.current) return;
      socketRef.current.emit(SocketEvents.ANSWER_SUBMIT, payload);
      setSubmittedOptions(payload.selectedOptions ?? []);
      setSubmittedResponseText(payload.responseText?.trim() || null);
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
    submittedResponseText,
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
