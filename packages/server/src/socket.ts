import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import {
  SocketEvents,
  StudentJoinPayload,
  AnswerSubmitPayload,
  TICK_INTERVAL_MS,
  Quiz,
} from "@mdq/shared";
import {
  getSession,
  addParticipant,
  recordSubmission,
  getDistribution,
  getSubmissionCount,
  getAnsweredQuestions,
  transitionState,
  computeLeaderboard,
} from "./session";
import { Session } from "@mdq/shared";
import {
  isInstructorAuthEnabled,
  getInstructorSessionFromCookie,
  hasValidInstructorSession,
} from "./instructor-auth";

function logActivity(message: string): void {
  console.log(`[mdq activity] ${message}`);
}

/** Active timer handles per session */
const sessionTimers = new Map<string, NodeJS.Timeout>();
const tickTimers = new Map<string, NodeJS.Timeout>();

/** Quiz store reference (set by setupSocket) */
let quizStore: Map<string, Quiz>;

/** Clean up timers for a session */
export function clearSessionTimers(sessionId: string): void {
  const timer = sessionTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    sessionTimers.delete(sessionId);
  }
  const tick = tickTimers.get(sessionId);
  if (tick) {
    clearInterval(tick);
    tickTimers.delete(sessionId);
  }
}

/** Get the Socket.IO room name for a session */
function sessionRoom(sessionId: string): string {
  return `session:${sessionId}`;
}

function buildQuestionOpenPayload(session: Session): {
  questionIndex: number;
  topic: string;
  text: string;
  options: { label: string; text: string }[];
  allowsMultiple: boolean;
  timeLimitSec: number;
  startedAt: number;
} | null {
  const quiz = quizStore.get(session.week);
  const question =
    quiz && session.currentQuestionIndex >= 0
      ? quiz.questions[session.currentQuestionIndex]
      : undefined;

  if (!quiz || !question) {
    return null;
  }

  return {
    questionIndex: session.currentQuestionIndex,
    topic: question.topic,
    text: question.textHtml,
    options: question.options.map((o) => ({ label: o.label, text: o.textHtml })),
    allowsMultiple: question.allowsMultiple,
    timeLimitSec: question.timeLimitSec,
    startedAt: session.questionStartedAt || Date.now(),
  };
}

function emitInstructorStateSnapshot(socket: Socket, session: Session): void {
  socket.emit(SocketEvents.SESSION_STATE, {
    state: session.state,
    questionIndex: session.currentQuestionIndex >= 0 ? session.currentQuestionIndex : undefined,
  });

  const questionOpenPayload = buildQuestionOpenPayload(session);
  const quiz = quizStore.get(session.week);

  if (session.state === "QUESTION_OPEN" && questionOpenPayload) {
    socket.emit(SocketEvents.QUESTION_OPEN, questionOpenPayload);
    if (session.questionStartedAt) {
      const elapsed = Math.floor((Date.now() - session.questionStartedAt) / 1000);
      const remaining = Math.max(0, questionOpenPayload.timeLimitSec - elapsed);
      socket.emit(SocketEvents.QUESTION_TICK, { remainingSec: remaining });
    }
    socket.emit(SocketEvents.ANSWER_COUNT, {
      questionIndex: session.currentQuestionIndex,
      ...getSubmissionCount(session, session.currentQuestionIndex),
    });
    return;
  }

  if (session.state === "QUESTION_CLOSED" && questionOpenPayload) {
    socket.emit(SocketEvents.QUESTION_OPEN, questionOpenPayload);
    socket.emit(SocketEvents.QUESTION_CLOSE, {
      questionIndex: session.currentQuestionIndex,
    });
    socket.emit(SocketEvents.RESULTS_DISTRIBUTION, {
      questionIndex: session.currentQuestionIndex,
      distribution: getDistribution(session, session.currentQuestionIndex),
    });
    socket.emit(SocketEvents.ANSWER_COUNT, {
      questionIndex: session.currentQuestionIndex,
      ...getSubmissionCount(session, session.currentQuestionIndex),
    });
    return;
  }

  if (session.state === "REVEAL" && questionOpenPayload && quiz) {
    const question = quiz.questions[session.currentQuestionIndex];
    socket.emit(SocketEvents.QUESTION_OPEN, questionOpenPayload);
    socket.emit(SocketEvents.RESULTS_REVEAL, {
      questionIndex: session.currentQuestionIndex,
      correctOptions: question.correctOptions,
      explanation: question.explanation,
      distribution: getDistribution(session, session.currentQuestionIndex),
    });
    socket.emit(SocketEvents.ANSWER_COUNT, {
      questionIndex: session.currentQuestionIndex,
      ...getSubmissionCount(session, session.currentQuestionIndex),
    });
    return;
  }

  if (session.state === "LEADERBOARD" && quiz) {
    const correctMap = new Map<number, string[]>();
    quiz.questions.forEach((q, i) => correctMap.set(i, q.correctOptions));
    const entries = computeLeaderboard(session, correctMap);
    socket.emit(SocketEvents.LEADERBOARD_UPDATE, {
      entries,
      totalQuestions: quiz.questions.length,
    });
  }
}

function emitJoinStateSnapshot(socket: Socket, session: Session, isReconnect: boolean): void {
  const questionOpenPayload = buildQuestionOpenPayload(session);
  const quiz = quizStore.get(session.week);

  if (!questionOpenPayload || !quiz) {
    return;
  }

  const question = quiz.questions[session.currentQuestionIndex];

  if (session.state === "QUESTION_OPEN") {
    socket.emit(SocketEvents.QUESTION_OPEN, questionOpenPayload);
    if (session.questionStartedAt) {
      const elapsed = Math.floor((Date.now() - session.questionStartedAt) / 1000);
      const remaining = Math.max(0, question.timeLimitSec - elapsed);
      socket.emit(SocketEvents.QUESTION_TICK, { remainingSec: remaining });
    }
    return;
  }

  if (session.state === "QUESTION_CLOSED") {
    socket.emit(SocketEvents.QUESTION_OPEN, questionOpenPayload);
    socket.emit(SocketEvents.QUESTION_CLOSE, {
      questionIndex: session.currentQuestionIndex,
    });
    return;
  }

  if (session.state === "REVEAL") {
    // Late joiners who were not previously connected should wait for next question.
    // Rejoiners get full reveal context so they can recover their previous view.
    if (!isReconnect) {
      return;
    }
    socket.emit(SocketEvents.QUESTION_OPEN, questionOpenPayload);
    socket.emit(SocketEvents.RESULTS_REVEAL, {
      questionIndex: session.currentQuestionIndex,
      correctOptions: question.correctOptions,
      explanation: question.explanation,
      distribution: getDistribution(session, session.currentQuestionIndex),
    });
    return;
  }

  if (session.state === "LEADERBOARD") {
    const correctMap = new Map<number, string[]>();
    quiz.questions.forEach((q, i) => correctMap.set(i, q.correctOptions));
    const entries = computeLeaderboard(session, correctMap);
    socket.emit(SocketEvents.LEADERBOARD_UPDATE, {
      entries,
      totalQuestions: quiz.questions.length,
    });
  }
}

/**
 * Setup Socket.IO on an HTTP server.
 * Handles student:join, answer:submit, reconnection, and timer logic.
 */
export function setupSocket(httpServer: HttpServer, quizzes: Map<string, Quiz>): Server {
  quizStore = quizzes;

  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.on("connection", (socket: Socket) => {
    // Extract sessionId from auth or handshake query
    const sessionId = socket.handshake.auth?.sessionId as string
      || socket.handshake.query?.sessionId as string;

    if (!sessionId) {
      socket.emit(SocketEvents.STUDENT_REJECTED, { reason: "Missing sessionId" });
      logActivity(`reject socket=${socket.id} reason=missing-session-id`);
      socket.disconnect();
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      socket.emit(SocketEvents.STUDENT_REJECTED, { reason: "Session not found" });
      logActivity(`reject socket=${socket.id} session=${sessionId} reason=session-not-found`);
      socket.disconnect();
      return;
    }

    if (session.state === "ENDED") {
      socket.emit(SocketEvents.STUDENT_REJECTED, { reason: "Session has ended" });
      logActivity(`reject socket=${socket.id} session=${sessionId} reason=session-ended`);
      socket.disconnect();
      return;
    }

    // ── Instructor auto-join room ──────────────
    const role = socket.handshake.auth?.role as string
      || socket.handshake.query?.role as string;

    if (role === "instructor") {
      if (isInstructorAuthEnabled()) {
        const sessionToken = getInstructorSessionFromCookie(socket.handshake.headers.cookie);
        if (!sessionToken || !hasValidInstructorSession(sessionToken)) {
          socket.emit(SocketEvents.STUDENT_REJECTED, { reason: "Instructor login required" });
          logActivity(`reject instructor socket=${socket.id} session=${sessionId} reason=unauthenticated`);
          socket.disconnect();
          return;
        }
      }
      socket.join(sessionRoom(sessionId));
      logActivity(`instructor connected session=${sessionId} socket=${socket.id}`);

      // Send current participant list immediately
      broadcastParticipants(io, session, sessionId);
      emitInstructorStateSnapshot(socket, session);

      // Track disconnect for instructor
      socket.on("disconnect", () => {
        // Nothing to clean up for instructor; room membership is auto-removed by Socket.IO
        logActivity(`instructor disconnected session=${sessionId} socket=${socket.id}`);
      });
    }

    // ── student:join ──────────────────────────
    socket.on(SocketEvents.STUDENT_JOIN, (payload: StudentJoinPayload) => {
      try {
        if (!payload.studentId || payload.studentId.trim().length === 0) {
          socket.emit(SocketEvents.STUDENT_REJECTED, { reason: "Student ID is required" });
          return;
        }

        const { participant, isReconnect } = addParticipant(
          session,
          payload.studentId.trim(),
          socket.id,
          payload.displayName?.trim(),
          payload.sessionToken,
          payload.clientInstanceId,
        );

        // Join the session room
        socket.join(sessionRoom(sessionId));

        // Store studentId on socket data for disconnect handling
        (socket as Socket & { _studentId?: string; _sessionId?: string })._studentId = participant.studentId;
        (socket as Socket & { _studentId?: string; _sessionId?: string })._sessionId = sessionId;

        // Send joined acknowledgment
        const answeredQuestions = getAnsweredQuestions(session, participant.studentId);
        socket.emit(SocketEvents.STUDENT_JOINED, {
          participantId: participant.studentId,
          sessionToken: participant.sessionToken,
          sessionState: session.state,
          currentQuestion: session.currentQuestionIndex >= 0 ? session.currentQuestionIndex : undefined,
          answeredQuestions,
        });

        // Broadcast updated participant list to instructor
        broadcastParticipants(io, session, sessionId);

        logActivity(
          `student ${isReconnect ? "rejoined" : "joined"} session=${sessionId} id=${participant.studentId} socket=${socket.id}`,
        );

        emitJoinStateSnapshot(socket, session, isReconnect);

      } catch (e) {
        socket.emit(SocketEvents.STUDENT_REJECTED, {
          reason: e instanceof Error ? e.message : "Join failed",
        });
        logActivity(
          `student rejected session=${sessionId} id=${payload.studentId || "unknown"} socket=${socket.id} reason=${e instanceof Error ? e.message : "join-failed"}`,
        );
      }
    });

    // ── answer:submit ─────────────────────────
    socket.on(SocketEvents.ANSWER_SUBMIT, (payload: AnswerSubmitPayload) => {
      const studentId = (socket as Socket & { _studentId?: string })._studentId;
      if (!studentId) {
        socket.emit(SocketEvents.ANSWER_REJECTED, {
          questionIndex: payload.questionIndex,
          reason: "Not joined to a session",
        });
        return;
      }

      try {
        const quiz = quizStore.get(session.week);
        const question = quiz?.questions[session.currentQuestionIndex];
        if (!question) {
          throw new Error(`Question ${session.currentQuestionIndex + 1} not found.`);
        }
        if (payload.questionIndex === session.currentQuestionIndex && !question.allowsMultiple && payload.selectedOptions.length > 1) {
          throw new Error("This question accepts one answer only.");
        }
        recordSubmission(session, studentId, payload.questionIndex, payload.selectedOptions);
        socket.emit(SocketEvents.ANSWER_ACCEPTED, { questionIndex: payload.questionIndex });

        // Send updated count to instructor
        const count = getSubmissionCount(session, payload.questionIndex);
        io.to(sessionRoom(sessionId)).emit(SocketEvents.ANSWER_COUNT, {
          questionIndex: payload.questionIndex,
          submitted: count.submitted,
          total: count.total,
        });
      } catch (e) {
        socket.emit(SocketEvents.ANSWER_REJECTED, {
          questionIndex: payload.questionIndex,
          reason: e instanceof Error ? e.message : "Submission failed",
        });
        logActivity(
          `answer rejected session=${sessionId} id=${studentId} q=${payload.questionIndex} reason=${e instanceof Error ? e.message : "submission-failed"}`,
        );
      }
    });

    // ── Disconnect handling ───────────────────
    socket.on("disconnect", () => {
      const sid = (socket as Socket & { _studentId?: string })._studentId;
      if (sid) {
        const p = session.participants.get(sid);
        if (p) {
          p.connected = false;
        }
        broadcastParticipants(io, session, sessionId);
        logActivity(`student disconnected session=${sessionId} id=${sid} socket=${socket.id}`);
      }
    });
  });

  return io;
}

/** Broadcast participant list to all connected clients in a session */
function broadcastParticipants(io: Server, session: Session, sessionId: string): void {
  const participants = [...session.participants.values()]
    .filter((p) => p.connected)
    .map((p) => ({ studentId: p.studentId, displayName: p.displayName }));

  io.to(sessionRoom(sessionId)).emit(SocketEvents.SESSION_PARTICIPANTS, {
    count: participants.length,
    participants,
  });
}

/**
 * Start the question timer for a session.
 * Auto-closes the question after timeLimitSec and broadcasts question:close.
 * Broadcasts question:tick every second.
 */
export function startQuestionTimer(
  io: Server,
  session: Session,
  sessionId: string,
  timeLimitSec: number,
): void {
  // Clear any existing timers
  clearSessionTimers(sessionId);

  let remaining = timeLimitSec;

  // Tick every second
  const tickInterval = setInterval(() => {
    remaining--;
    if (remaining >= 0) {
      io.to(sessionRoom(sessionId)).emit(SocketEvents.QUESTION_TICK, {
        remainingSec: remaining,
      });
    }
  }, TICK_INTERVAL_MS);
  tickTimers.set(sessionId, tickInterval);

  // Auto-close after time limit
  const closeTimer = setTimeout(() => {
    clearSessionTimers(sessionId);
    if (session.state === "QUESTION_OPEN") {
      try {
        transitionState(session, "QUESTION_CLOSED");
        io.to(sessionRoom(sessionId)).emit(SocketEvents.QUESTION_CLOSE, {
          questionIndex: session.currentQuestionIndex,
        });
        io.to(sessionRoom(sessionId)).emit(SocketEvents.SESSION_STATE, {
          state: session.state,
          questionIndex: session.currentQuestionIndex,
        });

        // Send distribution to instructor
        const dist = getDistribution(session, session.currentQuestionIndex);
        io.to(sessionRoom(sessionId)).emit(SocketEvents.RESULTS_DISTRIBUTION, {
          questionIndex: session.currentQuestionIndex,
          distribution: dist,
        });
      } catch {
        // State may have already changed (instructor closed manually)
      }
    }
  }, timeLimitSec * 1000);
  sessionTimers.set(sessionId, closeTimer);
}

/**
 * Broadcast a question open event and start the timer.
 */
export function broadcastQuestionOpen(
  io: Server,
  session: Session,
  sessionId: string,
  quiz: Quiz,
): void {
  const q = quiz.questions[session.currentQuestionIndex];
  session.questionStartedAt = Date.now();

  io.to(sessionRoom(sessionId)).emit(SocketEvents.QUESTION_OPEN, {
    questionIndex: session.currentQuestionIndex,
    topic: q.topic,
    text: q.textHtml,
    options: q.options.map((o) => ({ label: o.label, text: o.textHtml })),
    allowsMultiple: q.allowsMultiple,
    timeLimitSec: q.timeLimitSec,
    startedAt: session.questionStartedAt,
  });

  io.to(sessionRoom(sessionId)).emit(SocketEvents.SESSION_STATE, {
    state: session.state,
    questionIndex: session.currentQuestionIndex,
  });

  startQuestionTimer(io, session, sessionId, q.timeLimitSec);
}

/**
 * Broadcast reveal event with correct answer and explanation.
 */
export function broadcastReveal(
  io: Server,
  session: Session,
  sessionId: string,
  quiz: Quiz,
): void {
  const q = quiz.questions[session.currentQuestionIndex];
  const dist = getDistribution(session, session.currentQuestionIndex);

  io.to(sessionRoom(sessionId)).emit(SocketEvents.RESULTS_REVEAL, {
    questionIndex: session.currentQuestionIndex,
    correctOptions: q.correctOptions,
    explanation: q.explanation,
    distribution: dist,
  });

  io.to(sessionRoom(sessionId)).emit(SocketEvents.SESSION_STATE, {
    state: session.state,
    questionIndex: session.currentQuestionIndex,
  });
}

/**
 * Broadcast leaderboard.
 */
export function broadcastLeaderboard(
  io: Server,
  session: Session,
  sessionId: string,
  quiz: Quiz,
): void {
  const correctMap = new Map<number, string[]>();
  quiz.questions.forEach((q, i) => correctMap.set(i, q.correctOptions));
  const entries = computeLeaderboard(session, correctMap);

  io.to(sessionRoom(sessionId)).emit(SocketEvents.LEADERBOARD_UPDATE, {
    entries,
    totalQuestions: quiz.questions.length,
  });

  io.to(sessionRoom(sessionId)).emit(SocketEvents.SESSION_STATE, {
    state: session.state,
  });
}
