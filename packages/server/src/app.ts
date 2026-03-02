import express from "express";
import cors from "cors";
import { API } from "@md-quiz/shared";
import {
  createSession,
  storeSession,
  getSession,
  transitionState,
  StateTransitionError,
  computeLeaderboard,
} from "./session";
import { parseQuizMarkdown } from "./parser";
import { Quiz } from "@md-quiz/shared";
import * as fs from "fs";
import * as path from "path";

export function createApp(quizDir?: string) {
  const app = express();
  app.use(cors());
  app.use(express.json());

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

  // Expose for testing
  (app as unknown as { _quizzes: Map<string, Quiz> })._quizzes = quizzes;

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
        res.json({ state: "ENDED" });
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

  // ── Access info (stub for now) ────────────
  app.get(API.ACCESS_INFO, (_req, res) => {
    res.json({
      fullUrl: "http://localhost:3000",
      shortUrl: "",
      qrCodePath: "",
      source: "lan-fallback",
    });
  });

  return app;
}
