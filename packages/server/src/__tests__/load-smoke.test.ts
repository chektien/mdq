/**
 * Load smoke test: simulates N concurrent students joining, answering,
 * and completing a quiz session. Validates no errors under load.
 *
 * Usage:
 *   npx jest --testPathPattern load-smoke --forceExit
 *   LOAD_STUDENTS=50 npx jest --testPathPattern load-smoke --forceExit
 *
 * Parameterized via environment:
 *   LOAD_STUDENTS  - Number of simulated students (default: 20)
 *   LOAD_TIMEOUT   - Max wait time per step in ms (default: 10000)
 */

import { createServer, Server as HttpServer } from "http";
import { Server as IOServer } from "socket.io";
import { io as ioClient, Socket as ClientSocket } from "socket.io-client";
import request from "supertest";
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
  ResultsRevealPayload,
  LeaderboardUpdatePayload,
} from "@md-quiz/shared";
import * as path from "path";
import { AddressInfo } from "net";

const STUDENT_COUNT = parseInt(process.env.LOAD_STUDENTS || "20", 10);
const STEP_TIMEOUT = parseInt(process.env.LOAD_TIMEOUT || "10000", 10);
const quizDir = path.join(__dirname, "../../../../data/quizzes");

function waitFor<T>(socket: ClientSocket, event: string, timeout = STEP_TIMEOUT): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${event}`)), timeout);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

describe(`Load Smoke: ${STUDENT_COUNT} students`, () => {
  let httpServer: HttpServer;
  let ioServer: IOServer;
  let port: number;
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
            const dist = getDistribution(session, session.currentQuestionIndex);
            io.to(sessionRoom(sessionId)).emit(SocketEvents.RESULTS_DISTRIBUTION, {
              questionIndex: session.currentQuestionIndex,
              distribution: dist,
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
            io.to(sessionRoom(sessionId)).emit(SocketEvents.SESSION_STATE, {
              state: "ENDED",
            });
            break;
        }
      },
    });
    httpServer = createServer(app);
    const quizzes = (app as unknown as { _quizzes: Map<string, Quiz> })._quizzes;
    ioServer = setupSocket(httpServer, quizzes);
    ioRef.current = ioServer;
    httpServer.listen(0, () => {
      port = (httpServer.address() as AddressInfo).port;
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

  it(`handles ${STUDENT_COUNT} concurrent students through a full session`, async () => {
    const start = Date.now();

    // Create session
    const createRes = await request(app)
      .post("/api/session")
      .send({ week: "week01", mode: "open" })
      .expect(201);
    const { sessionId } = createRes.body;

    // Connect all students in parallel
    const sockets: ClientSocket[] = [];
    const joinPromises: Promise<StudentJoinedPayload>[] = [];

    for (let i = 0; i < STUDENT_COUNT; i++) {
      const sid = `LOAD${String(i).padStart(4, "0")}`;
      const socket = ioClient(baseUrl, {
        autoConnect: false,
        auth: { sessionId },
        transports: ["websocket"],
      });
      sockets.push(socket);

      const jp = waitFor<StudentJoinedPayload>(socket, SocketEvents.STUDENT_JOINED);
      socket.connect();
      socket.emit(SocketEvents.STUDENT_JOIN, {
        studentId: sid,
        displayName: `Student ${i}`,
      });
      joinPromises.push(jp);
    }

    const joins = await Promise.all(joinPromises);
    const joinTime = Date.now() - start;
    expect(joins.length).toBe(STUDENT_COUNT);
    for (const j of joins) {
      expect(j.sessionState).toBe("LOBBY");
    }
    console.log(`  Join phase: ${STUDENT_COUNT} students in ${joinTime}ms`);

    // Start quiz - register listeners BEFORE POST to avoid race condition
    const qOpenPromises = sockets.map((s) =>
      waitFor<QuestionOpenPayload>(s, SocketEvents.QUESTION_OPEN),
    );
    await request(app).post(`/api/session/${sessionId}/start`).expect(200);

    // All students receive question open
    const qOpens = await Promise.all(qOpenPromises);
    expect(qOpens.length).toBe(STUDENT_COUNT);

    // All students submit answers concurrently
    const submitStart = Date.now();
    const options = ["A", "B", "C", "D"];
    const answerPromises = sockets.map((s, i) => {
      const ap = waitFor<AnswerAcceptedPayload>(s, SocketEvents.ANSWER_ACCEPTED);
      s.emit(SocketEvents.ANSWER_SUBMIT, {
        questionIndex: 0,
        selectedOptions: [options[i % options.length]],
      });
      return ap;
    });

    const answers = await Promise.all(answerPromises);
    const submitTime = Date.now() - submitStart;
    expect(answers.length).toBe(STUDENT_COUNT);
    console.log(`  Submit phase: ${STUDENT_COUNT} answers in ${submitTime}ms`);

    // Close and reveal - register listeners BEFORE POST
    await request(app).post(`/api/session/${sessionId}/close`).expect(200);
    await new Promise((r) => setTimeout(r, 50));

    const revealPromises = sockets.map((s) =>
      waitFor<ResultsRevealPayload>(s, SocketEvents.RESULTS_REVEAL),
    );
    await request(app).post(`/api/session/${sessionId}/reveal`).expect(200);
    const reveals = await Promise.all(revealPromises);
    expect(reveals.length).toBe(STUDENT_COUNT);

    // Show leaderboard - register listeners BEFORE POST
    const lbPromises = sockets.map((s) =>
      waitFor<LeaderboardUpdatePayload>(s, SocketEvents.LEADERBOARD_UPDATE),
    );
    await request(app)
      .post(`/api/session/${sessionId}/leaderboard-show`)
      .expect(200);
    const lbs = await Promise.all(lbPromises);
    expect(lbs[0].entries.length).toBe(STUDENT_COUNT);

    // End session
    await request(app).post(`/api/session/${sessionId}/end`).expect(200);

    const totalTime = Date.now() - start;
    console.log(`  Total: ${totalTime}ms for ${STUDENT_COUNT} students, 1 question`);

    // Cleanup sockets
    for (const s of sockets) {
      s.disconnect();
    }
  }, 60000);
});
