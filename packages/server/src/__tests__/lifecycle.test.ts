import request from "supertest";
import { createApp } from "../app";
import { clearAllSessions } from "../session";
import * as path from "path";

const quizDir = path.join(__dirname, "../../../../data/quizzes");

describe("REST API", () => {
  const app = createApp(quizDir);

  beforeEach(() => {
    clearAllSessions();
  });

  describe("GET /api/health", () => {
    it("returns ok", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
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
  });
});
