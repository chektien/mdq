import request from "supertest";
import { createApp } from "../app";
import { clearAllSessions } from "../session";
import { setCachedAccessInfo } from "../access-info";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

const quizDir = path.join(__dirname, "fixtures/quizzes");

describe("REST API", () => {
  const app = createApp(quizDir);

  beforeEach(() => {
    clearAllSessions();
    setCachedAccessInfo(null);
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
