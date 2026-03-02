import { createServer } from "http";
import { createApp } from "./app";
import {
  setupSocket,
  broadcastQuestionOpen,
  broadcastReveal,
  broadcastLeaderboard,
  clearSessionTimers,
} from "./socket";
import { DEFAULT_PORT, Quiz, Session, SessionState, SocketEvents } from "@md-quiz/shared";
import { detectAccessInfo } from "./access-info";
import { getDistribution } from "./session";
import * as path from "path";
import * as fs from "fs";
import express from "express";

const port = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
const quizDir = process.env.QUIZ_DIR || path.join(__dirname, "../../data/quizzes");
const clientDist = path.join(__dirname, "../../client/dist");

// We need io available for the state change callback, so we use a container
// that's populated after setupSocket. The callback won't fire before the server starts.
const ioRef: { current: ReturnType<typeof setupSocket> | null } = { current: null };

function sessionRoom(sessionId: string): string {
  return `session:${sessionId}`;
}

const app = createApp({
  quizDir,
  onStateChange: (session: Session, sessionId: string, newState: SessionState, quiz?: Quiz) => {
    const io = ioRef.current;
    if (!io) return;

    switch (newState) {
      case "QUESTION_OPEN":
        if (quiz) {
          broadcastQuestionOpen(io, session, sessionId, quiz);
        }
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
        // Send distribution
        const dist = getDistribution(session, session.currentQuestionIndex);
        io.to(sessionRoom(sessionId)).emit(SocketEvents.RESULTS_DISTRIBUTION, {
          questionIndex: session.currentQuestionIndex,
          distribution: dist,
        });
        break;
      }

      case "REVEAL":
        if (quiz) {
          broadcastReveal(io, session, sessionId, quiz);
        }
        break;

      case "LEADERBOARD":
        if (quiz) {
          broadcastLeaderboard(io, session, sessionId, quiz);
        }
        break;

      case "ENDED":
        io.to(sessionRoom(sessionId)).emit(SocketEvents.SESSION_STATE, {
          state: "ENDED",
        });
        break;
    }
  },
});

const httpServer = createServer(app);

// Access the quiz store from the app for socket setup
const quizzes = (app as unknown as { _quizzes: Map<string, Quiz> })._quizzes;
ioRef.current = setupSocket(httpServer, quizzes);

// ── Serve client static files in production ──
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback: serve index.html for any non-API route
  app.get("*", (req: express.Request, res: express.Response) => {
    if (!req.path.startsWith("/api") && !req.path.startsWith("/socket.io")) {
      res.sendFile(path.join(clientDist, "index.html"));
    }
  });
}

httpServer.listen(port, async () => {
  console.log(`md-quiz server listening on port ${port}`);
  console.log(`Quiz directory: ${quizDir}`);

  // Detect access info (Tailscale/LAN) on startup
  try {
    const info = await detectAccessInfo(port);
    console.log(`Access URL: ${info.fullUrl} (source: ${info.source})`);
    if (info.shortUrl) {
      console.log(`Short URL: ${info.shortUrl}`);
    }
    if (info.warning) {
      console.warn(`Warning: ${info.warning}`);
    }
  } catch (e) {
    console.error("Failed to detect access info:", e);
  }
});
