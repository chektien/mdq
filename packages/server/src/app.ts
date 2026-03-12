import express from "express";
import cors from "cors";
import { API, AccessInfo, Quiz, Session, SessionState } from "@mdq/shared";
import {
  createSession,
  storeSession,
  getSession,
  getSessionByCode,
  transitionState,
  StateTransitionError,
  computeLeaderboard,
  getActiveSessions,
} from "./session";
import { parseQuizMarkdown } from "./parser";
import {
  persistSessionOnEnd,
  computeCumulativeLeaderboard,
  persistSessionProgressOnReveal,
} from "./persistence";
import { buildScoredCorrectAnswersMap, getScoredQuestionCount } from "./scoring";
import { getCachedAccessInfo, generateQrDataUrl, generateShortUrl } from "./access-info";
import {
  INSTRUCTOR_SESSION_COOKIE,
  isInstructorAuthEnabled,
  verifyInstructorPassword,
  createInstructorSession,
  revokeInstructorSession,
  getInstructorSessionFromCookie,
  hasValidInstructorSession,
} from "./instructor-auth";
import * as fs from "fs";
import * as path from "path";

export interface AppOptions {
  quizDir?: string;
  dataDir?: string;
  instanceId?: string;
  theme?: "dark" | "light";
  /** Called after a successful REST-driven state transition */
  onStateChange?: (session: Session, sessionId: string, newState: SessionState, quiz?: Quiz) => void;
}

export function createApp(quizDirOrOpts?: string | AppOptions) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  function requireInstructorAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
    if (!isInstructorAuthEnabled()) {
      next();
      return;
    }

    const sessionToken = getInstructorSessionFromCookie(req.header("cookie"));
    if (!sessionToken || !hasValidInstructorSession(sessionToken)) {
      res.status(401).json({ error: "Instructor login required" });
      return;
    }

    next();
  }

  // Parse options
  let quizDir: string | undefined;
  let dataDir: string | undefined;
  let instanceId: string | undefined;
  let theme: "dark" | "light" = "dark";
  let onStateChange: AppOptions["onStateChange"];
  if (typeof quizDirOrOpts === "string") {
    quizDir = quizDirOrOpts;
  } else if (quizDirOrOpts) {
    quizDir = quizDirOrOpts.quizDir;
    dataDir = quizDirOrOpts.dataDir;
    instanceId = quizDirOrOpts.instanceId;
    theme = quizDirOrOpts.theme || "dark";
    onStateChange = quizDirOrOpts.onStateChange;
  }
  const resolvedInstanceId = (instanceId || process.env.MDQ_INSTANCE_ID || "").trim() || `pid-${process.pid}`;
  const imagesDir = dataDir ? path.join(dataDir, "images") : undefined;

  app.use((_req, res, next) => {
    res.setHeader("x-mdq-instance-id", resolvedInstanceId);
    next();
  });

  if (imagesDir && fs.existsSync(imagesDir)) {
    app.use("/data/images", express.static(imagesDir, {
      fallthrough: true,
      index: false,
      immutable: false,
      maxAge: 0,
    }));
  }

  // ── Quiz store ──────────────────────────────
  const quizzes = new Map<string, Quiz>();

  function getQuestionHeadings(quiz: Quiz): string[] {
    return quiz.questions.map((question) => (
      question.subtopic ? `${question.topic}: ${question.subtopic}` : question.topic
    ));
  }

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

  function buildPresentationUrl(baseUrl: string, sessionId: string): string {
    const normalized = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    return `${normalized}/#/present/${sessionId}`;
  }

  async function buildSessionAccessInfo(baseUrl: string, sessionId: string, sessionCode: string): Promise<AccessInfo> {
    const baseInfo = getCachedAccessInfo() || {
      fullUrl: baseUrl,
      shortUrl: "",
      qrCodeDataUrl: "",
      qrTargetUrl: baseUrl,
      source: "lan-fallback" as const,
      warning: "Access info not yet detected. Server may still be starting.",
      detectedAt: Date.now(),
    };

    const joinFullUrl = buildJoinUrl(baseInfo.fullUrl, sessionCode);
    const joinShortUrl = await generateShortUrl(joinFullUrl);
    const qrCodeDataUrl = await generateQrDataUrl(joinFullUrl);

    return {
      fullUrl: joinFullUrl,
      shortUrl: joinShortUrl,
      qrCodeDataUrl,
      qrTargetUrl: joinFullUrl,
      presentationUrl: buildPresentationUrl(baseInfo.fullUrl, sessionId),
      source: baseInfo.source,
      warning: baseInfo.warning,
      detectedAt: Date.now(),
    };
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

  app.get("/api/sessions/active", (_req, res) => {
    res.json(getActiveSessions());
  });

  app.get("/api/runtime-config", (_req, res) => {
    res.json({ theme });
  });

  app.get(API.INSTRUCTOR_SESSION, (req, res) => {
    if (!isInstructorAuthEnabled()) {
      return res.json({ authenticated: true, configured: false });
    }
    const sessionToken = getInstructorSessionFromCookie(req.header("cookie"));
    return res.json({
      authenticated: !!sessionToken && hasValidInstructorSession(sessionToken),
      configured: true,
    });
  });

  app.post(API.INSTRUCTOR_LOGIN, (req, res) => {
    if (!isInstructorAuthEnabled()) {
      return res.status(400).json({ error: "Instructor password is not configured" });
    }
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!verifyInstructorPassword(password)) {
      return res.status(401).json({ error: "Invalid instructor password" });
    }

    const token = createInstructorSession();
    const forwardedProto = req.get("x-forwarded-proto");
    const protocol = (forwardedProto ? forwardedProto.split(",")[0] : req.protocol) || "http";
    const secure = protocol === "https";

    res.cookie(INSTRUCTOR_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
    });
    return res.status(204).send();
  });

  app.post(API.INSTRUCTOR_LOGOUT, (req, res) => {
    const sessionToken = getInstructorSessionFromCookie(req.header("cookie"));
    if (sessionToken) {
      revokeInstructorSession(sessionToken);
    }
    res.clearCookie(INSTRUCTOR_SESSION_COOKIE, { path: "/" });
    return res.status(204).send();
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

  app.post(API.QUIZZES_RELOAD, requireInstructorAuth, (_req, res) => {
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
  app.post(API.SESSION_CREATE, requireInstructorAuth, (req, res) => {
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
      questionHeadings: getQuestionHeadings(quiz),
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

  app.get(API.SESSION_STATE_RESTORE, requireInstructorAuth, (req, res) => {
    withSession(req, res, (session) => {
      if (session.state === "ENDED") {
        return res.status(410).json({ error: "Session has ended" });
      }

      const quiz = getQuizForSession(session.week);
      if (!quiz) {
        return res.status(500).json({ error: "Quiz data not found" });
      }

      return res.json({
        sessionId: session.sessionId,
        sessionCode: session.sessionCode,
        week: session.week,
        state: session.state,
        currentQuestionIndex: session.currentQuestionIndex,
        questionCount: quiz.questions.length,
        questionHeadings: getQuestionHeadings(quiz),
      });
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

  app.post(API.SESSION_START, requireInstructorAuth, (req, res) => {
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

  app.post(API.SESSION_NEXT, requireInstructorAuth, (req, res) => {
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

  app.post(API.SESSION_CLOSE, requireInstructorAuth, (req, res) => {
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

  app.post(API.SESSION_REVEAL, requireInstructorAuth, (req, res) => {
    withSession(req, res, (session) => {
      try {
        transitionState(session, "REVEAL");
        const quiz = getQuizForSession(session.week);

        if (quiz) {
          try {
            const revealPersistence = persistSessionProgressOnReveal(session, quiz, dataDir);
            if (revealPersistence.status === "written" && revealPersistence.csv) {
              console.log(
                `[mdq persistence] session=${session.sessionId} code=${session.sessionCode} reveal_q=${revealPersistence.questionIndex + 1} csv_${revealPersistence.csv.action} path=${revealPersistence.csv.filePath} rows=${revealPersistence.csv.rowCount} questions=${revealPersistence.csv.questionCount}`,
              );
            } else {
              console.warn(
                `[mdq persistence] session=${session.sessionId} code=${session.sessionCode} reveal_q=${revealPersistence.questionIndex + 1} csv_skipped reason=${revealPersistence.reason || "unknown"}`,
              );
            }
          } catch (e) {
            console.error(`Failed to persist reveal progress for ${session.sessionId}:`, e);
          }
        } else {
          console.warn(
            `[mdq persistence] session=${session.sessionId} code=${session.sessionCode} csv_skipped reason=quiz_not_found week=${session.week}`,
          );
        }

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

  app.post(API.SESSION_END, requireInstructorAuth, (req, res) => {
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
  app.post(API.SESSION_LEADERBOARD_SHOW, requireInstructorAuth, (req, res) => {
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
  app.post(API.SESSION_LEADERBOARD_HIDE, requireInstructorAuth, (req, res) => {
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
      const correctAnswersMap = buildScoredCorrectAnswersMap(quiz);
      const entries = computeLeaderboard(session, correctAnswersMap);
      res.json({
        entries,
        totalQuestions: getScoredQuestionCount(quiz),
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

  app.get(API.SESSION_ACCESS_INFO, requireInstructorAuth, async (req, res) => {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const fallbackBase = getRequestBaseUrl(req);
    return res.json(await buildSessionAccessInfo(fallbackBase, session.sessionId, session.sessionCode));
  });

  app.get(API.SESSION_PRESENTATION, async (req, res) => {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (session.state === "ENDED") {
      return res.status(410).json({ error: "Session has ended" });
    }

    const quiz = getQuizForSession(session.week);
    if (!quiz) {
      return res.status(500).json({ error: "Quiz data not found" });
    }

    const fallbackBase = getRequestBaseUrl(req);
    const accessInfo = await buildSessionAccessInfo(fallbackBase, session.sessionId, session.sessionCode);

    return res.json({
      sessionId: session.sessionId,
      sessionCode: session.sessionCode,
      week: session.week,
      state: session.state,
      questionCount: quiz.questions.length,
      questionHeadings: getQuestionHeadings(quiz),
      accessInfo,
    });
  });

  return app;
}
