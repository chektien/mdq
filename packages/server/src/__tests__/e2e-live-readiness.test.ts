import { createServer, Server as HttpServer } from "http";
import { Server as IOServer } from "socket.io";
import { io as ioClient, Socket as ClientSocket } from "socket.io-client";
import request from "supertest";
import { AddressInfo } from "net";
import * as path from "path";

import { createApp } from "../app";
import {
  setupSocket,
  broadcastQuestionOpen,
  broadcastReveal,
  broadcastLeaderboard,
  clearSessionTimers,
} from "../socket";
import { clearAllSessions, getDistribution } from "../session";
import {
  SocketEvents,
  Quiz,
  StudentJoinedPayload,
  QuestionOpenPayload,
  AnswerAcceptedPayload,
  LeaderboardUpdatePayload,
  SessionStatePayload,
  AnswerCountPayload,
} from "@mdq/shared";

const quizDir = path.join(__dirname, "fixtures/quizzes");

function waitForEvent<T>(socket: ClientSocket, event: string, timeout = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function waitForParticipantCount(
  socket: ClientSocket,
  expectedCount: number,
  timeout = 5000,
): Promise<{ count: number }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for participant count ${expectedCount}`)),
      timeout,
    );

    const listener = (payload: { count: number }) => {
      if (payload.count === expectedCount) {
        clearTimeout(timer);
        socket.off(SocketEvents.SESSION_PARTICIPANTS, listener);
        resolve(payload);
      }
    };

    socket.on(SocketEvents.SESSION_PARTICIPANTS, listener);
  });
}

async function connectStudent(
  baseUrl: string,
  sessionId: string,
  studentId: string,
  displayName: string,
  sessionToken?: string,
): Promise<{ socket: ClientSocket; joined: StudentJoinedPayload }> {
  const socket = ioClient(baseUrl, {
    autoConnect: false,
    auth: { sessionId },
    transports: ["websocket"],
  });

  const joinedPromise = waitForEvent<StudentJoinedPayload>(socket, SocketEvents.STUDENT_JOINED);
  socket.connect();
  socket.emit(SocketEvents.STUDENT_JOIN, {
    studentId,
    displayName,
    sessionToken,
  });

  return {
    socket,
    joined: await joinedPromise,
  };
}

function createInstructorSocket(baseUrl: string, sessionId: string): ClientSocket {
  return ioClient(baseUrl, {
    autoConnect: false,
    auth: {
      sessionId,
      role: "instructor",
    },
    transports: ["websocket"],
  });
}

describe("E2E Live Readiness", () => {
  let httpServer: HttpServer;
  let ioServer: IOServer;
  let baseUrl: string;
  let app: ReturnType<typeof createApp>;

  beforeAll((done) => {
    const ioRef: { current: IOServer | null } = { current: null };

    function sessionRoom(sessionId: string): string {
      return `session:${sessionId}`;
    }

    app = createApp({
      quizDir,
      onStateChange: (session, sessionId, newState, quiz) => {
        const io = ioRef.current;
        if (!io) return;

        switch (newState) {
          case "QUESTION_OPEN":
            if (quiz) broadcastQuestionOpen(io, session, sessionId, quiz);
            break;
          case "QUESTION_CLOSED": {
            clearSessionTimers(sessionId);
            io.to(sessionRoom(sessionId)).emit(SocketEvents.QUESTION_CLOSE, {
              questionIndex: session.currentQuestionIndex,
            });
            io.to(sessionRoom(sessionId)).emit(SocketEvents.SESSION_STATE, {
              state: session.state,
              questionIndex: session.currentQuestionIndex,
            });
            io.to(sessionRoom(sessionId)).emit(SocketEvents.RESULTS_DISTRIBUTION, {
              questionIndex: session.currentQuestionIndex,
              distribution: getDistribution(session, session.currentQuestionIndex),
            });
            break;
          }
          case "REVEAL":
            if (quiz) broadcastReveal(io, session, sessionId, quiz);
            break;
          case "LEADERBOARD":
            if (quiz) broadcastLeaderboard(io, session, sessionId, quiz);
            break;
          case "ENDED":
            io.to(sessionRoom(sessionId)).emit(SocketEvents.SESSION_STATE, { state: "ENDED" });
            break;
        }
      },
    });

    httpServer = createServer(app);
    const quizzes = (app as unknown as { _quizzes: Map<string, Quiz> })._quizzes;
    ioServer = setupSocket(httpServer, quizzes);
    ioRef.current = ioServer;

    httpServer.listen(0, () => {
      const port = (httpServer.address() as AddressInfo).port;
      baseUrl = `http://localhost:${port}`;
      done();
    });
  });

  afterAll((done) => {
    ioServer.close();
    httpServer.close(done);
  });

  afterEach(() => {
    clearAllSessions();
  });

  it("keeps quiz flow alive across student and instructor reconnects", async () => {
    const createRes = await request(app)
      .post("/api/session")
      .send({ week: "week01", mode: "open" })
      .expect(201);

    const { sessionId } = createRes.body;

    let instructor = createInstructorSocket(baseUrl, sessionId);
    const instructorLobbyStatePromise = waitForEvent<SessionStatePayload>(
      instructor,
      SocketEvents.SESSION_STATE,
    );
    instructor.connect();
    const instructorLobbyState = await instructorLobbyStatePromise;
    expect(instructorLobbyState.state).toBe("LOBBY");

    await request(app).post(`/api/session/${sessionId}/start`).expect(200);

    const studentA = await connectStudent(baseUrl, sessionId, "LIVE001", "Alice");
    const studentB = await connectStudent(baseUrl, sessionId, "LIVE002", "Bob");
    const studentC = await connectStudent(baseUrl, sessionId, "LIVE003", "Charlie");

    expect(studentA.joined.sessionState).toBe("QUESTION_OPEN");
    expect(studentB.joined.sessionState).toBe("QUESTION_OPEN");
    expect(studentC.joined.sessionState).toBe("QUESTION_OPEN");

    const participantUpdate = await waitForParticipantCount(instructor, 3);
    expect(participantUpdate.count).toBe(3);

    const answerAcceptedA = waitForEvent<AnswerAcceptedPayload>(
      studentA.socket,
      SocketEvents.ANSWER_ACCEPTED,
    );
    studentA.socket.emit(SocketEvents.ANSWER_SUBMIT, {
      questionIndex: 0,
      selectedOptions: ["B"],
    });
    await answerAcceptedA;

    const answerAcceptedB = waitForEvent<AnswerAcceptedPayload>(
      studentB.socket,
      SocketEvents.ANSWER_ACCEPTED,
    );
    studentB.socket.emit(SocketEvents.ANSWER_SUBMIT, {
      questionIndex: 0,
      selectedOptions: ["A"],
    });
    await answerAcceptedB;

    studentB.socket.disconnect();
    const rejoinedB = await connectStudent(
      baseUrl,
      sessionId,
      "LIVE002",
      "Bob",
      studentB.joined.sessionToken,
    );
    expect(rejoinedB.joined.sessionState).toBe("QUESTION_OPEN");
    expect(rejoinedB.joined.answeredQuestions || []).toContain(0);

    instructor.disconnect();
    instructor = createInstructorSocket(baseUrl, sessionId);
    const instructorResumedStatePromise = waitForEvent<SessionStatePayload>(
      instructor,
      SocketEvents.SESSION_STATE,
    );
    const instructorResumedQuestionPromise = waitForEvent<QuestionOpenPayload>(
      instructor,
      SocketEvents.QUESTION_OPEN,
    );
    const instructorAnswerCountPromise = waitForEvent<AnswerCountPayload>(
      instructor,
      SocketEvents.ANSWER_COUNT,
    );
    instructor.connect();
    const instructorResumedState = await instructorResumedStatePromise;
    expect(instructorResumedState.state).toBe("QUESTION_OPEN");

    const instructorResumedQuestion = await instructorResumedQuestionPromise;
    expect(instructorResumedQuestion.questionIndex).toBe(0);

    const instructorAnswerCount = await instructorAnswerCountPromise;
    expect(instructorAnswerCount.questionIndex).toBe(0);
    expect(instructorAnswerCount.submitted).toBe(2);
    expect(instructorAnswerCount.total).toBe(3);

    await request(app).post(`/api/session/${sessionId}/close`).expect(200);

    const revealA = waitForEvent(studentA.socket, SocketEvents.RESULTS_REVEAL);
    const revealB = waitForEvent(rejoinedB.socket, SocketEvents.RESULTS_REVEAL);
    const revealC = waitForEvent(studentC.socket, SocketEvents.RESULTS_REVEAL);
    const revealInstructor = waitForEvent(instructor, SocketEvents.RESULTS_REVEAL);

    await request(app).post(`/api/session/${sessionId}/reveal`).expect(200);

    await Promise.all([revealA, revealB, revealC, revealInstructor]);

    const leaderboardA = waitForEvent<LeaderboardUpdatePayload>(
      studentA.socket,
      SocketEvents.LEADERBOARD_UPDATE,
    );
    const leaderboardB = waitForEvent<LeaderboardUpdatePayload>(
      rejoinedB.socket,
      SocketEvents.LEADERBOARD_UPDATE,
    );
    const leaderboardC = waitForEvent<LeaderboardUpdatePayload>(
      studentC.socket,
      SocketEvents.LEADERBOARD_UPDATE,
    );
    const leaderboardInstructor = waitForEvent<LeaderboardUpdatePayload>(
      instructor,
      SocketEvents.LEADERBOARD_UPDATE,
    );

    await request(app).post(`/api/session/${sessionId}/leaderboard-show`).expect(200);

    const [lbA, lbB, lbC, lbI] = await Promise.all([
      leaderboardA,
      leaderboardB,
      leaderboardC,
      leaderboardInstructor,
    ]);

    expect(lbA.entries.length).toBe(3);
    expect(lbB.entries.length).toBe(3);
    expect(lbC.entries.length).toBe(3);
    expect(lbI.entries.length).toBe(3);
    expect(lbI.totalQuestions).toBeGreaterThan(0);

    const idsFromInstructorView = lbI.entries.map((entry) => entry.studentId).sort();
    expect(idsFromInstructorView).toEqual(["LIVE001", "LIVE002", "LIVE003"]);

    const sessionStateCheck = await request(app)
      .get(`/api/session/by-code/${createRes.body.sessionCode}`)
      .expect(200);
    expect(sessionStateCheck.body.state).toBe("LEADERBOARD");

    studentA.socket.disconnect();
    rejoinedB.socket.disconnect();
    studentC.socket.disconnect();
    instructor.disconnect();
  }, 30000);
});
