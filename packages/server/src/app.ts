import express from "express";
import cors from "cors";
import { API, Quiz, Session, SessionState } from "@md-quiz/shared";
import {
  createSession,
  storeSession,
  getSession,
  getSessionByCode,
  transitionState,
  StateTransitionError,
  computeLeaderboard,
} from "./session";
import { parseQuizMarkdown } from "./parser";
import { persistSessionOnEnd, computeCumulativeLeaderboard } from "./persistence";
import { getCachedAccessInfo } from "./access-info";
import * as fs from "fs";
import * as path from "path";

export interface AppOptions {
  quizDir?: string;
  dataDir?: string;
  /** Called after a successful REST-driven state transition */
  onStateChange?: (session: Session, sessionId: string, newState: SessionState, quiz?: Quiz) => void;
}

export function createApp(quizDirOrOpts?: string | AppOptions) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Parse options
  let quizDir: string | undefined;
  let dataDir: string | undefined;
  let onStateChange: AppOptions["onStateChange"];
  if (typeof quizDirOrOpts === "string") {
    quizDir = quizDirOrOpts;
  } else if (quizDirOrOpts) {
    quizDir = quizDirOrOpts.quizDir;
    dataDir = quizDirOrOpts.dataDir;
    onStateChange = quizDirOrOpts.onStateChange;
  }

  // ── Quiz store ──────────────────────────────
  const quizzes = new Map<string, Quiz>();

  // Load quizzes from directory if provided
  if (quizDir && fs.existsSync(quizDir)) {
    const files = fs.readdirSync(quizDir).filter((f) => f.match(/^week\d+-quiz\.md$/));
    for (const file of files) {
      const md = fs.readFileSync(path.join(quizDir, file), "utf-8");
      const result = parseQuizMarkdown(md, file);
      if (result.quiz) {
        quizzes.set(result.quiz.week, result.quiz);
      }
      if (result.errors.length > 0) {
        console.warn(`Parse warnings for ${file}:`, result.errors.map((e) => e.message));
      }
    }
  }

  /** Helper to get quiz for a session */
  function getQuizForSession(week: string): Quiz | undefined {
    return quizzes.get(week);
  }

  /** Notify state change if callback is set */
  function notifyStateChange(session: Session, sessionId: string, quiz?: Quiz): void {
    if (onStateChange) {
      onStateChange(session, sessionId, session.state, quiz);
    }
  }

  // Expose for testing and socket setup
  (app as unknown as { _quizzes: Map<string, Quiz>; _dataDir?: string })._quizzes = quizzes;
  (app as unknown as { _quizzes: Map<string, Quiz>; _dataDir?: string })._dataDir = dataDir;

  // ── Health ────────────────────────────────
  const startTime = Date.now();
  app.get(API.HEALTH, (_req, res) => {
    res.json({ status: "ok", uptime: Date.now() - startTime });
  });

  // ── Quiz endpoints ────────────────────────
  app.get(API.QUIZZES, (_req, res) => {
    const list = [...quizzes.values()].map((q) => ({
      week: q.week,
      title: q.title,
      questionCount: q.questions.length,
    }));
    res.json(list);
  });

  app.get(API.QUIZ, (req, res) => {
    const quiz = quizzes.get(req.params.week);
    if (!quiz) {
      return res.status(404).json({ error: `Quiz not found: ${req.params.week}` });
    }
    res.json({
      week: quiz.week,
      title: quiz.title,
      questionCount: quiz.questions.length,
    });
  });

  // ── Session lifecycle ─────────────────────
  app.post(API.SESSION_CREATE, (req, res) => {
    const { week, mode = "open" } = req.body;
    if (!week) {
      return res.status(400).json({ error: "Missing required field: week" });
    }
    const quiz = quizzes.get(week);
    if (!quiz) {
      return res.status(404).json({ error: `Quiz not found: ${week}` });
    }
    const session = createSession(week, mode);
    storeSession(session);
    res.status(201).json({
      sessionId: session.sessionId,
      sessionCode: session.sessionCode,
      joinUrl: `/join/${session.sessionCode}`,
    });
  });

  // ── Session lookup by code ─────────────────
  app.get("/api/session/by-code/:code", (req, res) => {
    const session = getSessionByCode(req.params.code.toUpperCase());
    if (!session) {
      return res.status(404).json({ error: "Session not found for that code" });
    }
    res.json({
      sessionId: session.sessionId,
      sessionCode: session.sessionCode,
      state: session.state,
      week: session.week,
    });
  });

  // Helper middleware to get session by :id param
  function withSession(
    req: express.Request,
    res: express.Response,
    callback: (session: ReturnType<typeof getSession> & object) => void,
  ) {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    callback(session);
  }

  app.post(API.SESSION_START, (req, res) => {
    withSession(req, res, (session) => {
      try {
        transitionState(session, "QUESTION_OPEN");
        session.currentQuestionIndex = 0;
        session.questionStartedAt = Date.now();
        const quiz = getQuizForSession(session.week);
        notifyStateChange(session, req.params.id, quiz);
        res.json({ state: session.state, questionIndex: 0 });
      } catch (e) {
        if (e instanceof StateTransitionError) {
          return res.status(400).json({ error: e.message });
        }
        throw e;
      }
    });
  });

  app.post(API.SESSION_NEXT, (req, res) => {
    withSession(req, res, (session) => {
      const quiz = getQuizForSession(session.week);
      if (!quiz) {
        return res.status(500).json({ error: "Quiz data not found" });
      }
      const nextIndex = session.currentQuestionIndex + 1;
      if (nextIndex >= quiz.questions.length) {
        return res.status(400).json({ error: "No more questions" });
      }
      try {
        transitionState(session, "QUESTION_OPEN");
        session.currentQuestionIndex = nextIndex;
        session.questionStartedAt = Date.now();
        notifyStateChange(session, req.params.id, quiz);
        res.json({ state: session.state, questionIndex: nextIndex });
      } catch (e) {
        if (e instanceof StateTransitionError) {
          return res.status(400).json({ error: e.message });
        }
        throw e;
      }
    });
  });

  app.post(API.SESSION_CLOSE, (req, res) => {
    withSession(req, res, (session) => {
      try {
        transitionState(session, "QUESTION_CLOSED");
        const quiz = getQuizForSession(session.week);
        notifyStateChange(session, req.params.id, quiz);
        res.json({ state: session.state, questionIndex: session.currentQuestionIndex });
      } catch (e) {
        if (e instanceof StateTransitionError) {
          return res.status(400).json({ error: e.message });
        }
        throw e;
      }
    });
  });

  app.post(API.SESSION_REVEAL, (req, res) => {
    withSession(req, res, (session) => {
      try {
        transitionState(session, "REVEAL");
        const quiz = getQuizForSession(session.week);
        notifyStateChange(session, req.params.id, quiz);
        res.json({ state: session.state, questionIndex: session.currentQuestionIndex });
      } catch (e) {
        if (e instanceof StateTransitionError) {
          return res.status(400).json({ error: e.message });
        }
        throw e;
      }
    });
  });

  app.post(API.SESSION_END, (req, res) => {
    withSession(req, res, (session) => {
      try {
        // Allow ending from LEADERBOARD or REVEAL
        if (session.state === "REVEAL" || session.state === "QUESTION_CLOSED") {
          // Go to leaderboard first, then end
          transitionState(session, "LEADERBOARD");
        }
        if (session.state === "LEADERBOARD") {
          transitionState(session, "ENDED");
        } else {
          transitionState(session, "ENDED");
        }

        // Persist session data on end
        const quiz = getQuizForSession(session.week);
        if (quiz) {
          persistSessionOnEnd(session, quiz, dataDir);
        }

        notifyStateChange(session, req.params.id, quiz);
        res.json({ state: "ENDED" });
      } catch (e) {
        if (e instanceof StateTransitionError) {
          return res.status(400).json({ error: e.message });
        }
        throw e;
      }
    });
  });

  // Show leaderboard (REVEAL -> LEADERBOARD, without ending)
  app.post("/api/session/:id/leaderboard-show", (req, res) => {
    withSession(req, res, (session) => {
      try {
        transitionState(session, "LEADERBOARD");
        const quiz = getQuizForSession(session.week);
        notifyStateChange(session, req.params.id, quiz);
        res.json({ state: session.state });
      } catch (e) {
        if (e instanceof StateTransitionError) {
          return res.status(400).json({ error: e.message });
        }
        throw e;
      }
    });
  });

  app.get(API.SESSION_LEADERBOARD, (req, res) => {
    withSession(req, res, (session) => {
      const quiz = getQuizForSession(session.week);
      if (!quiz) {
        return res.status(500).json({ error: "Quiz data not found" });
      }
      const correctAnswersMap = new Map<number, string[]>();
      quiz.questions.forEach((q, i) => {
        correctAnswersMap.set(i, q.correctOptions);
      });
      const entries = computeLeaderboard(session, correctAnswersMap);
      res.json({
        entries,
        totalQuestions: quiz.questions.length,
      });
    });
  });

  // ── Cumulative leaderboard ────────────────
  app.get(API.CUMULATIVE_LEADERBOARD, (_req, res) => {
    try {
      const entries = computeCumulativeLeaderboard(dataDir);
      res.json({ entries });
    } catch {
      res.json({ entries: [] });
    }
  });

  // ── Access info ───────────────────────────
  app.get(API.ACCESS_INFO, (_req, res) => {
    const info = getCachedAccessInfo();
    if (info) {
      res.json(info);
    } else {
      // Fallback: not yet detected
      res.json({
        fullUrl: `http://localhost:${process.env.PORT || 3000}`,
        shortUrl: "",
        qrCodeDataUrl: "",
        source: "lan-fallback",
        warning: "Access info not yet detected. Server may still be starting.",
        detectedAt: Date.now(),
      });
    }
  });

  return app;
}
