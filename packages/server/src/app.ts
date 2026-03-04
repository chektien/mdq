import express from "express";
import cors from "cors";
import { API, Quiz, Session, SessionState } from "@mdq/shared";
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
import { getCachedAccessInfo, generateQrDataUrl, generateShortUrl } from "./access-info";
import * as fs from "fs";
import * as path from "path";

export interface AppOptions {
  quizDir?: string;
  dataDir?: string;
  instanceId?: string;
  /** Called after a successful REST-driven state transition */
  onStateChange?: (session: Session, sessionId: string, newState: SessionState, quiz?: Quiz) => void;
}

export function createApp(quizDirOrOpts?: string | AppOptions) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  const instructorKey = (process.env.INSTRUCTOR_KEY || "").trim();

  function requireInstructorKey(req: express.Request, res: express.Response, next: express.NextFunction): void {
    if (!instructorKey) {
      next();
      return;
    }
    const provided = req.header("x-instructor-key") || "";
    if (provided !== instructorKey) {
      res.status(403).json({ error: "Instructor key required" });
      return;
    }
    next();
  }

  // Parse options
  let quizDir: string | undefined;
  let dataDir: string | undefined;
  let instanceId: string | undefined;
  let onStateChange: AppOptions["onStateChange"];
  if (typeof quizDirOrOpts === "string") {
    quizDir = quizDirOrOpts;
  } else if (quizDirOrOpts) {
    quizDir = quizDirOrOpts.quizDir;
    dataDir = quizDirOrOpts.dataDir;
    instanceId = quizDirOrOpts.instanceId;
    onStateChange = quizDirOrOpts.onStateChange;
  }
  const resolvedInstanceId = (instanceId || process.env.MDQ_INSTANCE_ID || "").trim() || `pid-${process.pid}`;

  app.use((_req, res, next) => {
    res.setHeader("x-mdq-instance-id", resolvedInstanceId);
    next();
  });

  // ── Quiz store ──────────────────────────────
  const quizzes = new Map<string, Quiz>();

  function loadQuizzesFromDir(dirPath: string): number {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      return 0;
    }
    const files = fs.readdirSync(dirPath).filter((f) => f.match(/^week\d+(?:-[a-z0-9]+)*\.md$/i));
    const next = new Map<string, Quiz>();

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      try {
        const md = fs.readFileSync(filePath, "utf-8");
        const result = parseQuizMarkdown(md, file);
        if (result.quiz) {
          next.set(result.quiz.week, result.quiz);
        }
        if (result.errors.length > 0) {
          console.warn(`Parse warnings for ${file}:`, result.errors.map((e) => e.message));
        }
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: unknown }).code || "")
            : "";
        if (code === "ENOENT") {
          console.warn(`Skipping deleted quiz file during load: ${file}`);
          continue;
        }
        throw error;
      }
    }

    quizzes.clear();
    for (const [week, quiz] of next.entries()) {
      quizzes.set(week, quiz);
    }
    return quizzes.size;
  }

  // Load quizzes from directory if provided
  if (quizDir) {
    loadQuizzesFromDir(quizDir);
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

  function logActivity(message: string): void {
    console.log(`[mdq activity] ${message}`);
  }

  function buildJoinUrl(baseUrl: string, sessionCode: string): string {
    const normalized = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    // Use a clean path instead of hash-based URL so QR scanners don't strip
    // the fragment. The server redirects /join/:code to /#/join/:code.
    return `${normalized}/join/${sessionCode}`;
  }

  function getRequestBaseUrl(req: express.Request): string {
    const host = req.get("x-forwarded-host") || req.get("host");
    const forwardedProto = req.get("x-forwarded-proto");
    const protocol = (forwardedProto ? forwardedProto.split(",")[0] : req.protocol) || "http";

    if (host) {
      return `${protocol}://${host}`;
    }

    return `http://localhost:${process.env.PORT || 3000}`;
  }

  // Expose for testing and socket setup
  (app as unknown as { _quizzes: Map<string, Quiz>; _dataDir?: string })._quizzes = quizzes;
  (app as unknown as { _quizzes: Map<string, Quiz>; _dataDir?: string })._dataDir = dataDir;

  // ── Health ────────────────────────────────
  const startTime = Date.now();
  app.get(API.HEALTH, (_req, res) => {
    res.json({
      status: "ok",
      uptime: Date.now() - startTime,
      instanceId: resolvedInstanceId,
      pid: process.pid,
    });
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

  app.post(API.QUIZZES_RELOAD, requireInstructorKey, (_req, res) => {
    if (!quizDir) {
      return res.status(400).json({ error: "Quiz directory is not configured" });
    }
    try {
      const loaded = loadQuizzesFromDir(quizDir);
      const list = [...quizzes.values()].map((q) => ({
        week: q.week,
        title: q.title,
        questionCount: q.questions.length,
      }));
      return res.json({ loaded, quizzes: list });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to reload quizzes";
      return res.status(500).json({ error: message });
    }
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
  app.post(API.SESSION_CREATE, requireInstructorKey, (req, res) => {
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
    logActivity(`instructor created session id=${session.sessionId} code=${session.sessionCode} week=${week}`);
    res.status(201).json({
      sessionId: session.sessionId,
      sessionCode: session.sessionCode,
      joinUrl: `/join/${session.sessionCode}`,
    });
  });

  // ── Session lookup by code ─────────────────
  app.get(API.SESSION_BY_CODE, (req, res) => {
    const normalizedCode = (req.params.code || "").trim().toUpperCase();
    const session = getSessionByCode(normalizedCode);
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

  app.post(API.SESSION_START, requireInstructorKey, (req, res) => {
    withSession(req, res, (session) => {
      try {
        transitionState(session, "QUESTION_OPEN");
        session.currentQuestionIndex = 0;
        session.questionStartedAt = Date.now();
        const quiz = getQuizForSession(session.week);
        notifyStateChange(session, req.params.id, quiz);
        logActivity(`instructor start session=${req.params.id} q=0 state=${session.state}`);
        res.json({ state: session.state, questionIndex: 0 });
      } catch (e) {
        if (e instanceof StateTransitionError) {
          return res.status(400).json({ error: e.message });
        }
        throw e;
      }
    });
  });

  app.post(API.SESSION_NEXT, requireInstructorKey, (req, res) => {
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
        logActivity(`instructor next session=${req.params.id} q=${nextIndex} state=${session.state}`);
        res.json({ state: session.state, questionIndex: nextIndex });
      } catch (e) {
        if (e instanceof StateTransitionError) {
          return res.status(400).json({ error: e.message });
        }
        throw e;
      }
    });
  });

  app.post(API.SESSION_CLOSE, requireInstructorKey, (req, res) => {
    withSession(req, res, (session) => {
      try {
        transitionState(session, "QUESTION_CLOSED");
        const quiz = getQuizForSession(session.week);
        notifyStateChange(session, req.params.id, quiz);
        logActivity(`instructor close session=${req.params.id} q=${session.currentQuestionIndex} state=${session.state}`);
        res.json({ state: session.state, questionIndex: session.currentQuestionIndex });
      } catch (e) {
        if (e instanceof StateTransitionError) {
          return res.status(400).json({ error: e.message });
        }
        throw e;
      }
    });
  });

  app.post(API.SESSION_REVEAL, requireInstructorKey, (req, res) => {
    withSession(req, res, (session) => {
      try {
        transitionState(session, "REVEAL");
        const quiz = getQuizForSession(session.week);
        notifyStateChange(session, req.params.id, quiz);
        logActivity(`instructor reveal session=${req.params.id} q=${session.currentQuestionIndex} state=${session.state}`);
        res.json({ state: session.state, questionIndex: session.currentQuestionIndex });
      } catch (e) {
        if (e instanceof StateTransitionError) {
          return res.status(400).json({ error: e.message });
        }
        throw e;
      }
    });
  });

  app.post(API.SESSION_END, requireInstructorKey, (req, res) => {
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
        logActivity(`instructor end session=${req.params.id} state=ENDED`);
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
  app.post(API.SESSION_LEADERBOARD_SHOW, requireInstructorKey, (req, res) => {
    withSession(req, res, (session) => {
      try {
        if (session.state === "QUESTION_CLOSED") {
          transitionState(session, "REVEAL");
        }
        transitionState(session, "LEADERBOARD");
        const quiz = getQuizForSession(session.week);
        notifyStateChange(session, req.params.id, quiz);
        logActivity(`instructor leaderboard-show session=${req.params.id} q=${session.currentQuestionIndex} state=${session.state}`);
        res.json({ state: session.state });
      } catch (e) {
        if (e instanceof StateTransitionError) {
          return res.status(400).json({ error: e.message });
        }
        throw e;
      }
    });
  });

  // Hide leaderboard (LEADERBOARD -> REVEAL, continue quiz flow)
  app.post(API.SESSION_LEADERBOARD_HIDE, requireInstructorKey, (req, res) => {
    withSession(req, res, (session) => {
      try {
        const quiz = getQuizForSession(session.week);
        if (!quiz) {
          return res.status(500).json({ error: "Quiz data not found" });
        }

        const isLastQuestion = session.currentQuestionIndex >= quiz.questions.length - 1;
        if (isLastQuestion) {
          return res.json({
            state: session.state,
            questionIndex: session.currentQuestionIndex,
            lockedOnLeaderboard: true,
          });
        }

        transitionState(session, "REVEAL");
        notifyStateChange(session, req.params.id, quiz);
        logActivity(`instructor leaderboard-hide session=${req.params.id} q=${session.currentQuestionIndex} state=${session.state}`);
        res.json({ state: session.state, questionIndex: session.currentQuestionIndex });
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
  app.get(API.ACCESS_INFO, (req, res) => {
    const info = getCachedAccessInfo();
    if (info) {
      res.json(info);
    } else {
      // Fallback: not yet detected
      const fallbackBase = getRequestBaseUrl(req);
      res.json({
        fullUrl: fallbackBase,
        shortUrl: "",
        qrCodeDataUrl: "",
        qrTargetUrl: fallbackBase,
        source: "lan-fallback",
        warning: "Access info not yet detected. Server may still be starting.",
        detectedAt: Date.now(),
      });
    }
  });

  app.get(API.SESSION_ACCESS_INFO, requireInstructorKey, async (req, res) => {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const fallbackBase = getRequestBaseUrl(req);
    const baseInfo = getCachedAccessInfo() || {
      fullUrl: fallbackBase,
      shortUrl: "",
      qrCodeDataUrl: "",
      qrTargetUrl: fallbackBase,
      source: "lan-fallback" as const,
      warning: "Access info not yet detected. Server may still be starting.",
      detectedAt: Date.now(),
    };

    const joinFullUrl = buildJoinUrl(baseInfo.fullUrl, session.sessionCode);
    const joinShortUrl = await generateShortUrl(joinFullUrl);
    const qrCodeDataUrl = await generateQrDataUrl(joinFullUrl);

    return res.json({
      fullUrl: joinFullUrl,
      shortUrl: joinShortUrl,
      qrCodeDataUrl,
      qrTargetUrl: joinFullUrl,
      source: baseInfo.source,
      warning: baseInfo.warning,
      detectedAt: Date.now(),
    });
  });

  return app;
}
