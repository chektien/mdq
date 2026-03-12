import request from "supertest";
import { createApp } from "../app";
import { clearAllSessions } from "../session";
import { setCachedAccessInfo } from "../access-info";
import { clearInstructorSessionsForTests } from "../instructor-auth";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

const quizDir = path.join(__dirname, "fixtures/quizzes");

describe("REST API", () => {
  const app = createApp(quizDir);

  beforeEach(() => {
    clearAllSessions();
    clearInstructorSessionsForTests();
    setCachedAccessInfo(null);
  });

  describe("Instructor login", () => {
    const originalInstructorPassword = process.env.INSTRUCTOR_PASSWORD;

    afterEach(() => {
      if (typeof originalInstructorPassword === "string") {
        process.env.INSTRUCTOR_PASSWORD = originalInstructorPassword;
      } else {
        delete process.env.INSTRUCTOR_PASSWORD;
      }
      clearInstructorSessionsForTests();
    });

    it("blocks instructor endpoints until login when password is configured", async () => {
      process.env.INSTRUCTOR_PASSWORD = "secret-password";
      const protectedApp = createApp(quizDir);

      await request(protectedApp)
        .post("/api/session")
        .send({ week: "week01" })
        .expect(401);

      await request(protectedApp)
        .get("/api/session/nope/state")
        .expect(401);

      await request(protectedApp)
        .post("/api/instructor/login")
        .send({ password: "wrong" })
        .expect(401);

      const agent = request.agent(protectedApp);
      await agent
        .post("/api/instructor/login")
        .send({ password: "secret-password" })
        .expect(204);

      const createRes = await agent
        .post("/api/session")
        .send({ week: "week01" })
        .expect(201);

      await agent
        .get(`/api/session/${createRes.body.sessionId}/state`)
        .expect(200);

      const status = await agent
        .get("/api/instructor/session")
        .expect(200);
      expect(status.body.authenticated).toBe(true);
      expect(status.body.configured).toBe(true);
    });

    it("reports instructor session as authenticated when password is not configured", async () => {
      delete process.env.INSTRUCTOR_PASSWORD;
      const unprotectedApp = createApp(quizDir);

      const status = await request(unprotectedApp)
        .get("/api/instructor/session")
        .expect(200);

      expect(status.body.authenticated).toBe(true);
      expect(status.body.configured).toBe(false);
    });
  });

  describe("GET /api/health", () => {
    it("returns ok", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
      expect(typeof res.body.instanceId).toBe("string");
      expect(res.body.instanceId.length).toBeGreaterThan(0);
      expect(res.headers["x-mdq-instance-id"]).toBe(res.body.instanceId);
    });
  });

  describe("GET /api/runtime-config", () => {
    it("returns the configured runtime theme", async () => {
      const res = await request(createApp({ quizDir, theme: "light" })).get("/api/runtime-config");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ theme: "light" });
    });
  });

  describe("GET /api/quizzes", () => {
    it("lists available quizzes", async () => {
      const res = await request(app).get("/api/quizzes");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
      const w1 = res.body.find((q: { week: string }) => q.week === "week01");
      expect(w1).toBeDefined();
      expect(w1.questionCount).toBe(3);
    });

    it("loads week and lab variant quizzes as distinct keys", async () => {
      const tempQuizDir = fs.mkdtempSync(path.join(os.tmpdir(), "mdq-quiz-variants-"));
      const fixtureWeek01 = fs.readFileSync(path.join(quizDir, "week01.md"), "utf-8");
      fs.writeFileSync(path.join(tempQuizDir, "week09.md"), fixtureWeek01, "utf-8");
      fs.writeFileSync(path.join(tempQuizDir, "week09-lab.md"), fixtureWeek01, "utf-8");

      const variantApp = createApp(tempQuizDir);

      try {
        const listRes = await request(variantApp).get("/api/quizzes");
        expect(listRes.status).toBe(200);
        expect(listRes.body.find((q: { week: string }) => q.week === "week09")).toBeDefined();
        expect(listRes.body.find((q: { week: string }) => q.week === "week09-lab")).toBeDefined();

        const weekRes = await request(variantApp).get("/api/quiz/week09");
        expect(weekRes.status).toBe(200);

        const labRes = await request(variantApp).get("/api/quiz/week09-lab");
        expect(labRes.status).toBe(200);
      } finally {
        fs.rmSync(tempQuizDir, { recursive: true, force: true });
      }
    });
  });

  describe("POST /api/quizzes/reload", () => {
    it("reloads quiz markdown files without restarting server", async () => {
      const res = await request(app).post("/api/quizzes/reload");
      expect(res.status).toBe(200);
      expect(res.body.loaded).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(res.body.quizzes)).toBe(true);
      const w1 = res.body.quizzes.find((q: { week: string }) => q.week === "week01");
      expect(w1).toBeDefined();
    });

    it("skips a quiz file deleted during reload instead of failing", async () => {
      const tempQuizDir = fs.mkdtempSync(path.join(os.tmpdir(), "mdq-quiz-reload-"));
      const week01Path = path.join(tempQuizDir, "week01.md");
      const fixtureWeek01 = fs.readFileSync(path.join(quizDir, "week01.md"), "utf-8");
      fs.writeFileSync(week01Path, fixtureWeek01, "utf-8");

      const deletedTargetPath = path.join(tempQuizDir, "week02.deleted.md");
      const staleLinkPath = path.join(tempQuizDir, "week02.md");
      fs.symlinkSync(deletedTargetPath, staleLinkPath);

      const flakyApp = createApp(tempQuizDir);

      try {
        const res = await request(flakyApp).post("/api/quizzes/reload");
        expect(res.status).toBe(200);
        expect(res.body.loaded).toBe(1);
        expect(Array.isArray(res.body.quizzes)).toBe(true);
        expect(res.body.quizzes).toHaveLength(1);
        expect(res.body.quizzes[0].week).toBe("week01");
      } finally {
        fs.rmSync(tempQuizDir, { recursive: true, force: true });
      }
    });
  });

  describe("GET /api/quiz/:week", () => {
    it("returns quiz metadata", async () => {
      const res = await request(app).get("/api/quiz/week01");
      expect(res.status).toBe(200);
      expect(res.body.week).toBe("week01");
      expect(res.body.questionCount).toBe(3);
    });

    it("returns 404 for non-existent week", async () => {
      const res = await request(app).get("/api/quiz/week99");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /data/images/*", () => {
    it("serves quiz attachment files from the data images directory", async () => {
      const tempQuizDir = fs.mkdtempSync(path.join(os.tmpdir(), "mdq-images-quiz-"));
      const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mdq-images-data-"));
      const imageDir = path.join(tempDataDir, "images");
      fs.mkdirSync(imageDir, { recursive: true });

      const fixtureWeek01 = fs.readFileSync(path.join(quizDir, "week01.md"), "utf-8");
      fs.writeFileSync(path.join(tempQuizDir, "week01.md"), fixtureWeek01, "utf-8");

      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#f59e0b"/></svg>';
      fs.writeFileSync(path.join(imageDir, "xr-setup.svg"), svg, "utf-8");

      const imageApp = createApp({ quizDir: tempQuizDir, dataDir: tempDataDir });

      try {
        const res = await request(imageApp).get("/data/images/xr-setup.svg");
        expect(res.status).toBe(200);
        const bodyText = Buffer.isBuffer(res.body) ? res.body.toString("utf-8") : String(res.text || "");
        expect(bodyText).toContain("<svg");
        expect(res.headers["content-type"]).toContain("image/svg+xml");
      } finally {
        fs.rmSync(tempQuizDir, { recursive: true, force: true });
        fs.rmSync(tempDataDir, { recursive: true, force: true });
      }
    });
  });

  describe("Session lifecycle", () => {
    let sessionId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post("/api/session")
        .send({ week: "week01", mode: "open" });
      sessionId = res.body.sessionId;
    });

    it("creates a session", async () => {
      const res = await request(app)
        .post("/api/session")
        .send({ week: "week01" });
      expect(res.status).toBe(201);
      expect(res.body.sessionId).toBeTruthy();
      expect(res.body.sessionCode).toHaveLength(6);
      expect(res.body.questionHeadings).toEqual([
        "Intro: Definitions",
        "Intro: Defaults",
        "Intro: Multi-select",
      ]);
    });

    it("rejects session creation without week", async () => {
      const res = await request(app).post("/api/session").send({});
      expect(res.status).toBe(400);
    });

    it("rejects session creation for non-existent quiz", async () => {
      const res = await request(app)
        .post("/api/session")
        .send({ week: "week99" });
      expect(res.status).toBe(404);
    });

    it("starts session (LOBBY -> QUESTION_OPEN)", async () => {
      const res = await request(app).post(`/api/session/${sessionId}/start`);
      expect(res.status).toBe(200);
      expect(res.body.state).toBe("QUESTION_OPEN");
      expect(res.body.questionIndex).toBe(0);
    });

    it("follows full lifecycle", async () => {
      // Start
      let res = await request(app).post(`/api/session/${sessionId}/start`);
      expect(res.body.state).toBe("QUESTION_OPEN");

      // Close
      res = await request(app).post(`/api/session/${sessionId}/close`);
      expect(res.body.state).toBe("QUESTION_CLOSED");

      // Reveal
      res = await request(app).post(`/api/session/${sessionId}/reveal`);
      expect(res.body.state).toBe("REVEAL");

      // Next question
      res = await request(app).post(`/api/session/${sessionId}/next`);
      expect(res.body.state).toBe("QUESTION_OPEN");
      expect(res.body.questionIndex).toBe(1);

      // Close
      res = await request(app).post(`/api/session/${sessionId}/close`);
      expect(res.body.state).toBe("QUESTION_CLOSED");

      // Reveal
      res = await request(app).post(`/api/session/${sessionId}/reveal`);
      expect(res.body.state).toBe("REVEAL");

      // Next question
      res = await request(app).post(`/api/session/${sessionId}/next`);
      expect(res.body.state).toBe("QUESTION_OPEN");
      expect(res.body.questionIndex).toBe(2);

      // Close + Reveal + End
      res = await request(app).post(`/api/session/${sessionId}/close`);
      res = await request(app).post(`/api/session/${sessionId}/reveal`);
      res = await request(app).post(`/api/session/${sessionId}/end`);
      expect(res.body.state).toBe("ENDED");
    });

    it("writes per-reveal CSV progress and end-of-quiz markdown summary", async () => {
      const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mdq-lifecycle-persist-"));
      const persistApp = createApp({ quizDir, dataDir: tempDataDir });
      const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();

      try {
        const createRes = await request(persistApp)
          .post("/api/session")
          .send({ week: "week01", mode: "open" })
          .expect(201);

        const sid = createRes.body.sessionId;
        const code = createRes.body.sessionCode;

        await request(persistApp).post(`/api/session/${sid}/start`).expect(200);
        await request(persistApp).post(`/api/session/${sid}/close`).expect(200);
        await request(persistApp).post(`/api/session/${sid}/reveal`).expect(200);

        const revealLogCall = consoleLogSpy.mock.calls.find((call) => call.join(" ").includes("csv_created"));
        expect(revealLogCall).toBeDefined();
        expect(revealLogCall?.join(" ")).toContain(`session=${sid}`);

        const submissionsPath = path.join(tempDataDir, "submissions");
        const csvFilesAfterReveal = fs.readdirSync(submissionsPath).filter((f) => f.endsWith(".csv"));
        expect(csvFilesAfterReveal).toHaveLength(1);
        expect(csvFilesAfterReveal[0]).toMatch(new RegExp(`^${code}-\\d{8}-\\d{6}\\.csv$`));

        await request(persistApp).post(`/api/session/${sid}/next`).expect(200);
        await request(persistApp).post(`/api/session/${sid}/close`).expect(200);
        await request(persistApp).post(`/api/session/${sid}/reveal`).expect(200);

        const updateLogCall = consoleLogSpy.mock.calls.find((call) => call.join(" ").includes("csv_updated"));
        expect(updateLogCall).toBeDefined();
        expect(updateLogCall?.join(" ")).toContain(`session=${sid}`);

        const csvContentAfterReveal = fs.readFileSync(path.join(submissionsPath, csvFilesAfterReveal[0]), "utf-8");
        expect(csvContentAfterReveal).toContain("q1_revealed_at_iso");

        const summaryFilesAfterReveal = fs.readdirSync(submissionsPath).filter((f) => f.endsWith("-summary.md"));
        expect(summaryFilesAfterReveal).toHaveLength(0);

        await request(persistApp).post(`/api/session/${sid}/end`).expect(200);

        const endCsvLogCall = consoleLogSpy.mock.calls.find(
          (call) => call.join(" ").includes("csv_updated") && !call.join(" ").includes("reveal_q="),
        );
        expect(endCsvLogCall).toBeDefined();
        expect(endCsvLogCall?.join(" ")).toContain(`session=${sid}`);
        expect(endCsvLogCall?.join(" ")).toContain(`code=${code}`);
        expect(endCsvLogCall?.join(" ")).toContain("path=");

        const summaryLogCall = consoleLogSpy.mock.calls.find((call) => call.join(" ").includes("summary_markdown_created"));
        expect(summaryLogCall).toBeDefined();
        expect(summaryLogCall?.join(" ")).toContain(`session=${sid}`);

        const summaryFilesAfterEnd = fs.readdirSync(submissionsPath).filter((f) => f.endsWith("-summary.md"));
        expect(summaryFilesAfterEnd).toHaveLength(1);

        const summaryContent = fs.readFileSync(path.join(submissionsPath, summaryFilesAfterEnd[0]), "utf-8");
        expect(summaryContent).toContain("# Quiz Session Summary");
        expect(summaryContent).toContain(`Session ID: ${sid}`);
      } finally {
        consoleLogSpy.mockRestore();
        fs.rmSync(tempDataDir, { recursive: true, force: true });
      }
    });

    it("rejects invalid transitions", async () => {
      // Try to close before starting
      let res = await request(app).post(`/api/session/${sessionId}/close`);
      expect(res.status).toBe(400);

      // Try to reveal before starting
      res = await request(app).post(`/api/session/${sessionId}/reveal`);
      expect(res.status).toBe(400);

      // Start, then try to start again
      await request(app).post(`/api/session/${sessionId}/start`);
      res = await request(app).post(`/api/session/${sessionId}/start`);
      expect(res.status).toBe(400);
    });

    it("rejects next when no more questions", async () => {
      // week01 has 3 questions, advance through all
      await request(app).post(`/api/session/${sessionId}/start`);
      await request(app).post(`/api/session/${sessionId}/close`);
      await request(app).post(`/api/session/${sessionId}/reveal`);
      await request(app).post(`/api/session/${sessionId}/next`);
      await request(app).post(`/api/session/${sessionId}/close`);
      await request(app).post(`/api/session/${sessionId}/reveal`);
      await request(app).post(`/api/session/${sessionId}/next`);
      await request(app).post(`/api/session/${sessionId}/close`);
      await request(app).post(`/api/session/${sessionId}/reveal`);
      // Now try to go beyond
      const res = await request(app).post(`/api/session/${sessionId}/next`);
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent session", async () => {
      const res = await request(app).post("/api/session/no-such-id/start");
      expect(res.status).toBe(404);
    });

    it("gets leaderboard", async () => {
      const res = await request(app).get(`/api/session/${sessionId}/leaderboard`);
      expect(res.status).toBe(200);
      expect(res.body.entries).toBeDefined();
      expect(res.body.totalQuestions).toBe(3);
    });

    it("resolves session code lookup with normalization", async () => {
      const createRes = await request(app)
        .post("/api/session")
        .send({ week: "week01" })
        .expect(201);

      const lower = createRes.body.sessionCode.toLowerCase();
      const res = await request(app)
        .get(`/api/session/by-code/%20${lower}%20`)
        .expect(200);

      expect(res.body.sessionId).toBe(createRes.body.sessionId);
      expect(res.body.sessionCode).toBe(createRes.body.sessionCode);
    });

    it("returns session-specific join access info", async () => {
      const createRes = await request(app)
        .post("/api/session")
        .send({ week: "week01" })
        .expect(201);

      const res = await request(app)
        .get(`/api/session/${createRes.body.sessionId}/access-info`)
        .set("Host", "quiz-host.local:3001")
        .expect(200);

      expect(res.body.fullUrl).toBe(`http://quiz-host.local:3001/join/${createRes.body.sessionCode}`);
      expect(res.body.fullUrl).toContain(`/join/${createRes.body.sessionCode}`);
      expect(res.body.qrTargetUrl).toContain(`/join/${createRes.body.sessionCode}`);
    });

    it("returns public presentation metadata for an active session", async () => {
      const createRes = await request(app)
        .post("/api/session")
        .send({ week: "week01" })
        .expect(201);

      const res = await request(app)
        .get(`/api/session/${createRes.body.sessionId}/presentation`)
        .set("Host", "quiz-host.local:3001")
        .expect(200);

      expect(res.body.sessionId).toBe(createRes.body.sessionId);
      expect(res.body.sessionCode).toBe(createRes.body.sessionCode);
      expect(res.body.questionHeadings).toEqual([
        "Intro: Definitions",
        "Intro: Defaults",
        "Intro: Multi-select",
      ]);
      expect(res.body.accessInfo.fullUrl).toBe(`http://quiz-host.local:3001/join/${createRes.body.sessionCode}`);
      expect(res.body.accessInfo.presentationUrl).toBe(`http://quiz-host.local:3001/#/present/${createRes.body.sessionId}`);
    });

    it("returns instructor restore snapshot for active session", async () => {
      await request(app).post(`/api/session/${sessionId}/start`).expect(200);

      const res = await request(app)
        .get(`/api/session/${sessionId}/state`)
        .expect(200);

      expect(res.body.sessionId).toBe(sessionId);
      expect(res.body.state).toBe("QUESTION_OPEN");
      expect(res.body.questionCount).toBe(3);
      expect(res.body.week).toBe("week01");
      expect(res.body.questionHeadings).toEqual([
        "Intro: Definitions",
        "Intro: Defaults",
        "Intro: Multi-select",
      ]);
    });

    it("returns 410 for restore request on ended session", async () => {
      await request(app).post(`/api/session/${sessionId}/start`).expect(200);
      await request(app).post(`/api/session/${sessionId}/close`).expect(200);
      await request(app).post(`/api/session/${sessionId}/reveal`).expect(200);
      await request(app).post(`/api/session/${sessionId}/end`).expect(200);

      const res = await request(app)
        .get(`/api/session/${sessionId}/state`)
        .expect(410);

      expect(res.body.error).toContain("ended");
    });

    it("uses request host for startup access info fallback", async () => {
      const res = await request(app)
        .get("/api/access-info")
        .set("Host", "quiz-host.local:3001")
        .expect(200);

      expect(res.body.fullUrl).toBe("http://quiz-host.local:3001");
      expect(res.body.qrTargetUrl).toBe("http://quiz-host.local:3001");
      expect(res.body.warning).toContain("not yet detected");
    });

    it("allows LEADERBOARD -> REVEAL resume", async () => {
      await request(app).post(`/api/session/${sessionId}/start`).expect(200);
      await request(app).post(`/api/session/${sessionId}/close`).expect(200);
      await request(app).post(`/api/session/${sessionId}/reveal`).expect(200);
      await request(app).post(`/api/session/${sessionId}/leaderboard-show`).expect(200);

      const res = await request(app)
        .post(`/api/session/${sessionId}/leaderboard-hide`)
        .expect(200);
      expect(res.body.state).toBe("REVEAL");
    });

    it("keeps LEADERBOARD when hiding after final question", async () => {
      await request(app).post(`/api/session/${sessionId}/start`).expect(200);
      await request(app).post(`/api/session/${sessionId}/close`).expect(200);
      await request(app).post(`/api/session/${sessionId}/reveal`).expect(200);
      await request(app).post(`/api/session/${sessionId}/next`).expect(200);
      await request(app).post(`/api/session/${sessionId}/close`).expect(200);
      await request(app).post(`/api/session/${sessionId}/reveal`).expect(200);
      await request(app).post(`/api/session/${sessionId}/next`).expect(200);
      await request(app).post(`/api/session/${sessionId}/close`).expect(200);
      await request(app).post(`/api/session/${sessionId}/reveal`).expect(200);
      await request(app).post(`/api/session/${sessionId}/leaderboard-show`).expect(200);

      const res = await request(app)
        .post(`/api/session/${sessionId}/leaderboard-hide`)
        .expect(200);

      expect(res.body.state).toBe("LEADERBOARD");
      expect(res.body.lockedOnLeaderboard).toBe(true);
    });

    it("allows leaderboard show from QUESTION_CLOSED on final question", async () => {
      await request(app).post(`/api/session/${sessionId}/start`).expect(200);
      await request(app).post(`/api/session/${sessionId}/close`).expect(200);
      await request(app).post(`/api/session/${sessionId}/reveal`).expect(200);
      await request(app).post(`/api/session/${sessionId}/next`).expect(200);
      await request(app).post(`/api/session/${sessionId}/close`).expect(200);
      await request(app).post(`/api/session/${sessionId}/reveal`).expect(200);
      await request(app).post(`/api/session/${sessionId}/next`).expect(200);
      await request(app).post(`/api/session/${sessionId}/close`).expect(200);

      const res = await request(app)
        .post(`/api/session/${sessionId}/leaderboard-show`)
        .expect(200);

      expect(res.body.state).toBe("LEADERBOARD");
    });
  });
});
