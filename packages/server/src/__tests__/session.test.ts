import {
  createSession,
  transitionState,
  addParticipant,
  recordSubmission,
  getDistribution,
  getSubmissionCount,
  computeLeaderboard,
  StateTransitionError,
} from "../session";
import { Session, SessionState, STATE_TRANSITIONS } from "@mdq/shared";

describe("Session Engine", () => {
  let session: Session;

  beforeEach(() => {
    session = createSession("week01", "open");
  });

  describe("createSession", () => {
    it("creates a session with LOBBY state", () => {
      expect(session.state).toBe("LOBBY");
      expect(session.currentQuestionIndex).toBe(-1);
      expect(session.sessionCode).toHaveLength(6);
      expect(session.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(session.mode).toBe("open");
      expect(session.week).toBe("week01");
    });
  });

  describe("state transitions", () => {
    it("allows LOBBY -> QUESTION_OPEN", () => {
      transitionState(session, "QUESTION_OPEN");
      expect(session.state).toBe("QUESTION_OPEN");
    });

    it("allows full happy path", () => {
      transitionState(session, "QUESTION_OPEN");
      transitionState(session, "QUESTION_CLOSED");
      transitionState(session, "REVEAL");
      transitionState(session, "QUESTION_OPEN"); // next question
      transitionState(session, "QUESTION_CLOSED");
      transitionState(session, "REVEAL");
      transitionState(session, "LEADERBOARD");
      transitionState(session, "ENDED");
      expect(session.state).toBe("ENDED");
    });

    it("rejects invalid transitions", () => {
      // LOBBY -> QUESTION_CLOSED is not allowed
      expect(() => transitionState(session, "QUESTION_CLOSED")).toThrow(
        StateTransitionError,
      );
      expect(() => transitionState(session, "REVEAL")).toThrow(StateTransitionError);
      expect(() => transitionState(session, "ENDED")).toThrow(StateTransitionError);
    });

    it("rejects transitions from ENDED", () => {
      transitionState(session, "QUESTION_OPEN");
      transitionState(session, "QUESTION_CLOSED");
      transitionState(session, "REVEAL");
      transitionState(session, "LEADERBOARD");
      transitionState(session, "ENDED");

      expect(() => transitionState(session, "LOBBY")).toThrow(StateTransitionError);
      expect(() => transitionState(session, "QUESTION_OPEN")).toThrow(
        StateTransitionError,
      );
    });

    it("allows REVEAL -> QUESTION_OPEN (next question)", () => {
      transitionState(session, "QUESTION_OPEN");
      transitionState(session, "QUESTION_CLOSED");
      transitionState(session, "REVEAL");
      // Can go to next question or leaderboard
      transitionState(session, "QUESTION_OPEN");
      expect(session.state).toBe("QUESTION_OPEN");
    });

    it("allows REVEAL -> LEADERBOARD", () => {
      transitionState(session, "QUESTION_OPEN");
      transitionState(session, "QUESTION_CLOSED");
      transitionState(session, "REVEAL");
      transitionState(session, "LEADERBOARD");
      expect(session.state).toBe("LEADERBOARD");
    });

    it("allows LEADERBOARD -> REVEAL for instructor resume", () => {
      transitionState(session, "QUESTION_OPEN");
      transitionState(session, "QUESTION_CLOSED");
      transitionState(session, "REVEAL");
      transitionState(session, "LEADERBOARD");
      transitionState(session, "REVEAL");
      expect(session.state).toBe("REVEAL");
    });

    it("validates all transitions in STATE_TRANSITIONS map", () => {
      // Exhaustive check: every invalid pair is rejected
      const allStates: SessionState[] = [
        "LOBBY",
        "QUESTION_OPEN",
        "QUESTION_CLOSED",
        "REVEAL",
        "LEADERBOARD",
        "ENDED",
      ];
      for (const from of allStates) {
        for (const to of allStates) {
          const s = createSession("w", "open");
          // Force state to "from"
          (s as { state: SessionState }).state = from;
          const allowed = STATE_TRANSITIONS[from].includes(to);
          if (allowed) {
            expect(() => transitionState(s, to)).not.toThrow();
          } else {
            expect(() => transitionState(s, to)).toThrow(StateTransitionError);
          }
        }
      }
    });
  });

  describe("participants", () => {
    it("adds a new participant", () => {
      const { participant, isReconnect } = addParticipant(
        session,
        "S001",
        "sock1",
        "Alice",
      );
      expect(isReconnect).toBe(false);
      expect(participant.studentId).toBe("S001");
      expect(participant.displayName).toBe("Alice");
      expect(participant.sessionToken).toBeTruthy();
      expect(participant.connected).toBe(true);
      expect(session.participants.size).toBe(1);
    });

    it("allows reconnection with matching token", () => {
      const { participant: p1 } = addParticipant(session, "S001", "sock1", "Alice");
      const token = p1.sessionToken;
      // Simulate disconnect
      p1.connected = false;
      p1.socketId = "";

      // Reconnect with same token
      const { participant: p2, isReconnect } = addParticipant(
        session,
        "S001",
        "sock2",
        undefined,
        token,
      );
      expect(isReconnect).toBe(true);
      expect(p2.socketId).toBe("sock2");
      expect(p2.connected).toBe(true);
      expect(session.participants.size).toBe(1); // still 1 participant
    });

    it("rejects duplicate studentId with different token", () => {
      addParticipant(session, "S001", "sock1");
      expect(() =>
        addParticipant(session, "S001", "sock2", undefined, "wrong-token"),
      ).toThrow(/already in use/);
    });

    it("rejects duplicate studentId with no token", () => {
      addParticipant(session, "S001", "sock1");
      expect(() => addParticipant(session, "S001", "sock2")).toThrow(/already in use/);
    });
  });

  describe("submissions", () => {
    beforeEach(() => {
      addParticipant(session, "S001", "sock1");
      addParticipant(session, "S002", "sock2");
      transitionState(session, "QUESTION_OPEN");
      session.currentQuestionIndex = 0;
      session.questionStartedAt = Date.now() - 1000;
    });

    it("records a valid submission", () => {
      const sub = recordSubmission(session, "S001", 0, ["B"]);
      expect(sub.studentId).toBe("S001");
      expect(sub.selectedOptions).toEqual(["B"]);
      expect(sub.responseTimeMs).toBeGreaterThan(0);
      expect(session.submissions).toHaveLength(1);
    });

    it("rejects duplicate submission", () => {
      recordSubmission(session, "S001", 0, ["B"]);
      expect(() => recordSubmission(session, "S001", 0, ["A"])).toThrow(
        /Already submitted/,
      );
    });

    it("rejects submission when not in QUESTION_OPEN", () => {
      transitionState(session, "QUESTION_CLOSED");
      expect(() => recordSubmission(session, "S001", 0, ["B"])).toThrow(
        /QUESTION_OPEN/,
      );
    });

    it("rejects submission for wrong question index", () => {
      expect(() => recordSubmission(session, "S001", 1, ["B"])).toThrow(
        /Question index mismatch/,
      );
    });

    it("rejects submission from non-participant", () => {
      expect(() => recordSubmission(session, "S999", 0, ["B"])).toThrow(
        /not a participant/,
      );
    });

    it("rejects submission with empty selectedOptions", () => {
      expect(() => recordSubmission(session, "S001", 0, [])).toThrow();
    });
  });

  describe("edge cases", () => {
    it("multiple participants can submit different answers to same question", () => {
      addParticipant(session, "S001", "sock1");
      addParticipant(session, "S002", "sock2");
      addParticipant(session, "S003", "sock3");
      transitionState(session, "QUESTION_OPEN");
      session.currentQuestionIndex = 0;
      session.questionStartedAt = Date.now() - 1000;

      recordSubmission(session, "S001", 0, ["A"]);
      recordSubmission(session, "S002", 0, ["B"]);
      recordSubmission(session, "S003", 0, ["C"]);
      expect(session.submissions).toHaveLength(3);

      const dist = getDistribution(session, 0);
      expect(dist).toEqual({ A: 1, B: 1, C: 1 });
    });

    it("QUESTION_OPEN -> QUESTION_CLOSED -> REVEAL -> QUESTION_OPEN cycle works repeatedly", () => {
      for (let i = 0; i < 5; i++) {
        transitionState(session, "QUESTION_OPEN");
        transitionState(session, "QUESTION_CLOSED");
        transitionState(session, "REVEAL");
      }
      expect(session.state).toBe("REVEAL");
      transitionState(session, "LEADERBOARD");
      transitionState(session, "ENDED");
      expect(session.state).toBe("ENDED");
    });

    it("leaderboard with no submissions returns empty entries for all participants", () => {
      addParticipant(session, "S001", "sock1", "Alice");
      addParticipant(session, "S002", "sock2", "Bob");

      const correctMap = new Map<number, string[]>();
      correctMap.set(0, ["A"]);

      const board = computeLeaderboard(session, correctMap);
      expect(board.length).toBe(2);
      expect(board[0].correctCount).toBe(0);
      expect(board[1].correctCount).toBe(0);
    });
  });

  describe("distribution and counts", () => {
    beforeEach(() => {
      addParticipant(session, "S001", "sock1");
      addParticipant(session, "S002", "sock2");
      addParticipant(session, "S003", "sock3");
      transitionState(session, "QUESTION_OPEN");
      session.currentQuestionIndex = 0;
      session.questionStartedAt = Date.now() - 1000;
    });

    it("computes answer distribution", () => {
      recordSubmission(session, "S001", 0, ["A"]);
      recordSubmission(session, "S002", 0, ["B"]);
      recordSubmission(session, "S003", 0, ["A"]);
      const dist = getDistribution(session, 0);
      expect(dist).toEqual({ A: 2, B: 1 });
    });

    it("computes submission count", () => {
      recordSubmission(session, "S001", 0, ["A"]);
      const count = getSubmissionCount(session, 0);
      expect(count).toEqual({ submitted: 1, total: 3 });
    });
  });

  describe("leaderboard", () => {
    it("ranks by correct count then time", () => {
      addParticipant(session, "S001", "sock1", "Alice");
      addParticipant(session, "S002", "sock2", "Bob");
      addParticipant(session, "S003", "sock3", "Charlie");

      // Simulate 2 questions
      transitionState(session, "QUESTION_OPEN");
      session.currentQuestionIndex = 0;
      session.questionStartedAt = Date.now() - 5000;

      recordSubmission(session, "S001", 0, ["B"]); // correct
      recordSubmission(session, "S002", 0, ["A"]); // wrong
      recordSubmission(session, "S003", 0, ["B"]); // correct

      transitionState(session, "QUESTION_CLOSED");
      transitionState(session, "REVEAL");
      transitionState(session, "QUESTION_OPEN");
      session.currentQuestionIndex = 1;
      session.questionStartedAt = Date.now() - 3000;

      recordSubmission(session, "S001", 1, ["C"]); // correct
      recordSubmission(session, "S002", 1, ["C"]); // correct
      recordSubmission(session, "S003", 1, ["A"]); // wrong

      const correctMap = new Map<number, string[]>();
      correctMap.set(0, ["B"]);
      correctMap.set(1, ["C"]);

      const board = computeLeaderboard(session, correctMap);

      // S001: 2 correct, S002: 1 correct, S003: 1 correct
      expect(board[0].studentId).toBe("S001");
      expect(board[0].correctCount).toBe(2);
      expect(board[0].rank).toBe(1);

      // S002 and S003 both have 1 correct, tiebreak by total time
      expect(board[1].correctCount).toBe(1);
      expect(board[2].correctCount).toBe(1);
    });
  });
});
