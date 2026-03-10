import { useState, useEffect, useCallback, useRef } from "react";
import { useSocket } from "../hooks/useSocket";
import type { QuestionState, RevealState } from "../hooks/useSocket";
import {
  fetchQuizzes,
  reloadQuizzes,
  createSession,
  startSession,
  nextQuestion,
  closeQuestion,
  revealAnswer,
  endSession,
  showLeaderboard,
  hideLeaderboard,
  fetchSessionAccessInfo,
  fetchSessionStateForRestore,
  type QuizSummary,
  type CreateSessionResponse,
} from "../hooks/api";
import type { AccessInfo, SessionState } from "@mdq/shared";
import Timer from "../components/Timer";
import DistributionChart from "../components/DistributionChart";
import Leaderboard from "../components/Leaderboard";
import QRPanel from "../components/QRPanel";
import QuizHtml from "../components/QuizHtml";

type InstructorPhase = "setup" | "lobby" | "live" | "ended";
const INSTRUCTOR_RESTORE_KEY = "mdquiz_instructor_session";
const INSTRUCTOR_RESTORE_SUCCESS_NOTICE = "Resumed active session after refresh.";

interface StoredInstructorRestore {
  sessionId: string;
  sessionCode: string;
  week: string;
  createdAt: number;
}

function formatQuizLabel(quizKey: string): string {
  const normalized = quizKey.trim();
  if (!normalized) return "MDQ";
  if (/\bmdq\b/i.test(normalized)) return normalized;
  return `${normalized} MDQ`;
}

function clearInstructorRestore(): void {
  try {
    sessionStorage.removeItem(INSTRUCTOR_RESTORE_KEY);
  } catch {
    // ignore
  }
}

function saveInstructorRestore(restore: StoredInstructorRestore): void {
  try {
    sessionStorage.setItem(INSTRUCTOR_RESTORE_KEY, JSON.stringify(restore));
  } catch {
    // ignore
  }
}

export default function InstructorView() {
  // Setup state
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Session state
  const [sessionInfo, setSessionInfo] = useState<CreateSessionResponse | null>(null);
  const [accessInfo, setAccessInfo] = useState<AccessInfo | null>(null);
  const [phase, setPhase] = useState<InstructorPhase>("setup");
  const [totalQuestionsInQuiz, setTotalQuestionsInQuiz] = useState(0);
  const [quizLabel, setQuizLabel] = useState("");
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const restoreAttemptedRef = useRef(false);

  // Socket connection (instructor role)
  const sock = useSocket(sessionInfo?.sessionId ?? null, "instructor");

  // Derive phase from socket session state
  useEffect(() => {
    if (!sock.sessionState) return;
    const s = sock.sessionState;
    if (s === "LOBBY") setPhase("lobby");
    else if (s === "ENDED") setPhase("ended");
    else setPhase("live");
  }, [sock.sessionState]);

  // Load quizzes on mount
  useEffect(() => {
    fetchQuizzes()
      .then((q) => {
        setQuizzes(q);
        if (q.length > 0) setSelectedWeek(q[0].week);
      })
      .catch((e) => setErrorMsg(e.message));
  }, []);

  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;

    let stored: StoredInstructorRestore | null = null;
    try {
      const raw = sessionStorage.getItem(INSTRUCTOR_RESTORE_KEY);
      if (raw) {
        stored = JSON.parse(raw) as StoredInstructorRestore;
      }
    } catch {
      clearInstructorRestore();
      return;
    }

    if (!stored?.sessionId) {
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    fetchSessionStateForRestore(stored.sessionId)
      .then(async (snapshot) => {
        const restoredInfo: CreateSessionResponse = {
          sessionId: snapshot.sessionId,
          sessionCode: snapshot.sessionCode,
          joinUrl: `/join/${snapshot.sessionCode}`,
        };

        setSessionInfo(restoredInfo);
        setSelectedWeek(snapshot.week);
        setTotalQuestionsInQuiz(snapshot.questionCount);
        setQuizLabel(formatQuizLabel(snapshot.week));

        if (snapshot.state === "LOBBY") {
          setPhase("lobby");
        } else {
          setPhase("live");
        }

        try {
          const ai = await fetchSessionAccessInfo(snapshot.sessionId);
          setAccessInfo(ai);
        } catch {
          // Non-critical
        }

        setRestoreNotice(INSTRUCTOR_RESTORE_SUCCESS_NOTICE);
      })
      .catch((error) => {
        clearInstructorRestore();
        const message = error instanceof Error ? error.message : "Unable to resume previous session.";
        if (/ended|not found|missing/i.test(message)) {
          setRestoreNotice("Previous session is no longer active. Start a new session when ready.");
        } else {
          setRestoreNotice("Unable to resume previous session. Start a new session when ready.");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!sessionInfo) {
      clearInstructorRestore();
      return;
    }

    if (phase === "ended" || phase === "setup") {
      clearInstructorRestore();
      return;
    }

    saveInstructorRestore({
      sessionId: sessionInfo.sessionId,
      sessionCode: sessionInfo.sessionCode,
      week: selectedWeek,
      createdAt: Date.now(),
    });
  }, [sessionInfo, phase, selectedWeek]);

  // ── Actions ──────────────────────────────

  const handleCreateSession = useCallback(async () => {
    if (!selectedWeek) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const info = await createSession(selectedWeek);
      setSessionInfo(info);
      const quiz = quizzes.find((q) => q.week === selectedWeek);
      if (quiz) setTotalQuestionsInQuiz(quiz.questionCount);
      setQuizLabel(formatQuizLabel(quiz?.week || selectedWeek));
      setRestoreNotice(null);
      setPhase("lobby");

      // Fetch session-specific access info for QR/URL display
      try {
        const ai = await fetchSessionAccessInfo(info.sessionId);
        setAccessInfo(ai);
      } catch {
        // Non-critical
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setLoading(false);
    }
  }, [selectedWeek, quizzes]);

  const handleReloadQuizzes = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await reloadQuizzes();
      setQuizzes(result.quizzes);
      if (!result.quizzes.find((q) => q.week === selectedWeek) && result.quizzes.length > 0) {
        setSelectedWeek(result.quizzes[0].week);
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to reload quizzes");
    } finally {
      setLoading(false);
    }
  }, [selectedWeek]);

  const handleAction = useCallback(
    async (action: () => Promise<unknown>, label: string) => {
      setRestoreNotice((current) => (
        current === INSTRUCTOR_RESTORE_SUCCESS_NOTICE ? null : current
      ));
      setLoading(true);
      setErrorMsg(null);
      try {
        await action();
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : `Failed to ${label}`);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleBackToSetup = useCallback(() => {
    sock.disconnect();
    clearInstructorRestore();
    setSessionInfo(null);
    setAccessInfo(null);
    setTotalQuestionsInQuiz(0);
    setQuizLabel("");
    setRestoreNotice(null);
    setErrorMsg(null);
    setPhase("setup");
  }, [sock]);

  const sid = sessionInfo?.sessionId ?? "";

  // ── Setup Phase ──────────────────────────
  if (phase === "setup") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-8 p-8">
        <a href="#/" className="absolute top-6 left-6 text-zinc-500 hover:text-zinc-300 text-sm">
          &larr; Back
        </a>
        <h1 className="text-3xl font-bold text-white">Start a Quiz Session</h1>

        {errorMsg && (
          <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-xl max-w-md w-full text-center">
            {errorMsg}
          </div>
        )}

        {restoreNotice && (
          <div className="bg-emerald-900/40 border border-emerald-700 text-emerald-100 px-4 py-3 rounded-xl max-w-2xl w-full text-center text-sm">
            {restoreNotice}
          </div>
        )}

        {quizzes.length === 0 ? (
          <p className="text-zinc-400">No quizzes found. Add quiz markdown files to the data/quizzes directory.</p>
        ) : (
          <div className="w-full max-w-md space-y-6">
            <div>
              <label htmlFor="quiz-select" className="block text-zinc-400 text-sm mb-2 font-medium">Select Quiz</label>
              <select
                id="quiz-select"
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {quizzes.map((q) => (
                  <option key={q.week} value={q.week}>
                    {q.title}{/\d+\s*question/i.test(q.title) ? "" : ` (${q.questionCount} questions)`}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleReloadQuizzes}
              disabled={loading}
              className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-700 disabled:text-zinc-500 border border-zinc-700 text-zinc-200 font-medium py-3 rounded-xl transition-colors"
            >
              {loading ? "Reloading..." : "Reload Quiz Files"}
            </button>
            <button
              onClick={handleCreateSession}
              disabled={loading || !selectedWeek}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold py-4 rounded-xl transition-colors text-lg"
            >
              {loading ? "Creating..." : "Create Session"}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Lobby Phase ──────────────────────────
  if (phase === "lobby") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-8 p-8">
        <button
          onClick={handleBackToSetup}
          className="absolute top-6 left-6 text-zinc-500 hover:text-zinc-300 text-sm"
        >
          &larr; Back to Setup
        </button>
        <h1 className="text-2xl font-bold text-white">Waiting for Students</h1>

        {/* QR + Join Info */}
        {accessInfo && sessionInfo && (
          <QRPanel
            qrDataUrl={accessInfo.qrCodeDataUrl}
            fullUrl={accessInfo.fullUrl}
            shortUrl={accessInfo.shortUrl}
            sessionCode={sessionInfo.sessionCode}
          />
        )}
        {!accessInfo && sessionInfo && (
          <div className="text-center">
            <p className="text-zinc-400 text-sm mb-1">Session Code</p>
            <p className="text-5xl font-mono font-bold text-white tracking-[0.2em]">
              {sessionInfo.sessionCode}
            </p>
          </div>
        )}

        {/* Participant count */}
        <div className="text-center">
          <span className="text-5xl font-bold text-white tabular-nums">
            {sock.participants?.count ?? 0}
          </span>
          <span className="text-zinc-400 text-lg ml-2">students joined</span>
        </div>

        {/* Participant list */}
        {sock.participants && sock.participants.count > 0 && (
          <div className="bg-zinc-800/50 rounded-xl p-4 max-w-lg w-full max-h-48 overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              {sock.participants.participants.map((p) => (
                <span
                  key={p.studentId}
                  className="bg-zinc-700 text-zinc-200 px-3 py-1 rounded-full text-sm"
                >
                  {p.displayName || p.studentId}
                </span>
              ))}
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-xl">
            {errorMsg}
          </div>
        )}

        {restoreNotice && (
          <div className="bg-emerald-900/40 border border-emerald-700 text-emerald-100 px-4 py-3 rounded-xl text-sm text-center max-w-2xl w-full">
            {restoreNotice}
          </div>
        )}

        <button
          onClick={() => handleAction(() => startSession(sid), "start")}
          disabled={loading}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-semibold py-4 px-12 rounded-xl transition-colors text-xl"
        >
          {loading ? "Starting..." : "Start Quiz"}
        </button>
      </div>
    );
  }

  // ── Ended Phase ──────────────────────────
  if (phase === "ended") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-8 p-8">
        <h1 className="text-3xl font-bold text-white">Session Ended</h1>
        {quizLabel && (
          <h2 className="text-xl font-semibold text-zinc-300 text-center">
            Leaderboard for {quizLabel.toUpperCase()}
          </h2>
        )}
        <Leaderboard
          entries={sock.leaderboard}
          totalQuestions={sock.totalQuestions || totalQuestionsInQuiz}
          maxRows={15}
        />
        <a
          href="#/"
          className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-3 px-8 rounded-xl transition-colors"
        >
          Back to Home
        </a>
      </div>
    );
  }

  // ── Live Phase (QUESTION_OPEN, QUESTION_CLOSED, REVEAL, LEADERBOARD) ──
  return (
    <LiveView
      sock={sock}
      sessionId={sid}
      sessionCode={sessionInfo?.sessionCode || ""}
      accessInfo={accessInfo}
      totalQuestionsInQuiz={totalQuestionsInQuiz}
      quizLabel={quizLabel}
      loading={loading}
      errorMsg={errorMsg}
      restoreNotice={restoreNotice}
      onAction={handleAction}
    />
  );
}

// ── Live sub-view ──────────────────────────

function LiveView({
  sock,
  sessionId,
  sessionCode,
  accessInfo,
  totalQuestionsInQuiz,
  quizLabel,
  loading,
  errorMsg,
  restoreNotice,
  onAction,
}: {
  sock: ReturnType<typeof useSocket>;
  sessionId: string;
  sessionCode: string;
  accessInfo: AccessInfo | null;
  totalQuestionsInQuiz: number;
  quizLabel: string;
  loading: boolean;
  errorMsg: string | null;
  restoreNotice: string | null;
  onAction: (action: () => Promise<unknown>, label: string) => void;
}) {
  const state = sock.sessionState as SessionState;
  const q = sock.currentQuestion as QuestionState | null;
  const rev = sock.reveal as RevealState | null;

  const [reviewQuestionIndex, setReviewQuestionIndex] = useState<number | null>(null);
  const [questionCache, setQuestionCache] = useState<Record<number, QuestionState>>({});
  const [revealCache, setRevealCache] = useState<Record<number, RevealState>>({});

  useEffect(() => {
    if (!q) return;
    setQuestionCache((prev) => ({ ...prev, [q.questionIndex]: q }));
  }, [q]);

  useEffect(() => {
    if (!rev) return;
    setRevealCache((prev) => ({ ...prev, [rev.questionIndex]: rev }));
  }, [rev]);

  const isReviewing = reviewQuestionIndex !== null;
  const liveQuestionIndex = q?.questionIndex ?? rev?.questionIndex ?? -1;
  const availableRevealIndices = Object.keys(revealCache)
    .map((idx) => parseInt(idx, 10))
    .filter((idx) => !Number.isNaN(idx))
    .sort((a, b) => a - b);
  const latestPriorReveal = availableRevealIndices.filter((idx) => idx < liveQuestionIndex).pop();

  const displayQuestion = isReviewing && reviewQuestionIndex !== null
    ? questionCache[reviewQuestionIndex] ?? null
    : q;
  const displayReveal = isReviewing && reviewQuestionIndex !== null
    ? revealCache[reviewQuestionIndex] ?? null
    : rev;
  const showDetailedRevealChoices = state === "REVEAL" && !!displayReveal && !!displayQuestion;

  // Determine which controls to show
  const canClose = state === "QUESTION_OPEN";
  const canReveal = state === "QUESTION_CLOSED";
  const canNext =
    state === "REVEAL" &&
    q &&
    q.questionIndex < totalQuestionsInQuiz - 1;
  const canShowLeaderboard = state === "REVEAL";
  const isFinalQuestion = liveQuestionIndex >= totalQuestionsInQuiz - 1;

  return (
    <div className={`min-h-dvh flex flex-col p-6 lg:p-10 ${accessInfo && sessionCode ? "lg:pr-56" : ""}`}>
      {/* Top bar: question progress + timer + participant count */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          {displayQuestion && (
            <span className="text-zinc-400 text-lg font-medium">
              Q{displayQuestion.questionIndex + 1}/{totalQuestionsInQuiz}
            </span>
          )}
          {displayQuestion && (
            <span className="text-zinc-600 text-sm">
              {displayQuestion.topic}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {/* Answered count */}
          {sock.answerCount && (state === "QUESTION_OPEN" || state === "QUESTION_CLOSED") && (
            <span className="text-zinc-400 font-mono tabular-nums">
              {sock.answerCount.submitted}/{sock.answerCount.total} answered
            </span>
          )}
          <span className="text-zinc-500 tabular-nums">
            {sock.participants?.count ?? 0} online
          </span>
          {isReviewing && reviewQuestionIndex !== null && (
            <span className="text-amber-300 text-sm font-medium">
              Reviewing Q{reviewQuestionIndex + 1} (students stay on live state)
            </span>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 max-w-4xl mx-auto w-full">
        {/* Question display (for QUESTION_OPEN, QUESTION_CLOSED) */}
        {displayQuestion && (((state === "QUESTION_OPEN" || state === "QUESTION_CLOSED") && !isReviewing) || (isReviewing && !displayReveal)) && (
          <>
            {/* Timer */}
            {state === "QUESTION_OPEN" && !isReviewing && (
              <Timer
                remainingSec={sock.remainingSec}
                totalSec={displayQuestion.timeLimitSec}
                size={140}
              />
            )}
            {state === "QUESTION_CLOSED" && !isReviewing && (
              <div className="text-amber-400 text-2xl font-bold">Time's up</div>
            )}
            {isReviewing && (
              <div className="text-amber-300 text-lg font-semibold">Review Mode</div>
            )}

            {/* Question text */}
            <QuizHtml
              className="quiz-html text-2xl lg:text-3xl text-white text-center leading-relaxed max-w-3xl"
              html={displayQuestion.text}
            />

            <div className={`selection-mode-chip ${displayQuestion.allowsMultiple ? "selection-mode-chip-multi" : "selection-mode-chip-single"}`}>
              {displayQuestion.allowsMultiple ? "Students can pick multiple options" : "Students can pick one option"}
            </div>

            {/* Options (display only, no interaction on instructor) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
              {displayQuestion.options.map((opt) => (
                <div
                  key={opt.label}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-5 py-4 flex items-start gap-3"
                >
                  <span className={`bg-zinc-700 text-zinc-300 font-mono font-bold w-9 h-9 flex items-center justify-center shrink-0 text-lg ${displayQuestion.allowsMultiple ? "rounded-lg" : "rounded-full"}`}>
                    {opt.label}
                  </span>
                  <QuizHtml className="quiz-html text-zinc-200 text-lg" html={opt.text} as="span" />
                </div>
              ))}
            </div>

            {/* Distribution (visible after close) */}
            {state === "QUESTION_CLOSED" && !isReviewing && sock.distribution && (
              <div className="w-full max-w-2xl mt-4">
                <h3 className="text-zinc-400 text-sm uppercase tracking-wide mb-3 font-medium">
                  Response Distribution
                </h3>
                <DistributionChart
                  distribution={sock.distribution.distribution}
                  labels={displayQuestion.options.map((o) => o.label)}
                />
              </div>
            )}
          </>
        )}

        {/* Reveal view */}
        {displayReveal && (((state === "REVEAL" && displayQuestion && !isReviewing) || (isReviewing && displayQuestion))) && (
          <>
            <QuizHtml
              className={`quiz-html text-center leading-relaxed max-w-3xl ${isReviewing ? "text-2xl lg:text-3xl text-white" : "text-xl lg:text-2xl text-zinc-300"}`}
              html={displayQuestion.text}
            />

            {showDetailedRevealChoices && (
              <div className="w-full max-w-2xl space-y-2">
                {displayQuestion.options.map((opt) => {
                  const isCorrect = displayReveal.correctOptions.includes(opt.label);
                  return (
                    <div
                      key={opt.label}
                      className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
                        isCorrect
                          ? "border-emerald-500/60 bg-emerald-600/15"
                          : "border-zinc-800 bg-zinc-900/60"
                      }`}
                    >
                      <span
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-mono font-bold text-sm ${
                          isCorrect ? "bg-emerald-600 text-white" : "bg-zinc-700 text-zinc-300"
                        }`}
                      >
                        {opt.label}
                      </span>
                      <QuizHtml
                        className={`quiz-html pt-0.5 ${isCorrect ? "text-emerald-100" : "text-zinc-200"}`}
                        html={opt.text}
                        as="span"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {displayReveal.explanation && (
              <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-xl p-6 max-w-2xl w-full">
                <h3 className="text-emerald-400 font-semibold mb-2">Explanation</h3>
                <p className="text-emerald-100 text-lg leading-relaxed">{displayReveal.explanation}</p>
              </div>
            )}
          </>
        )}

        {/* Leaderboard view */}
        {state === "LEADERBOARD" && !isReviewing && (
          <div className="w-full">
            <h2 className="text-2xl font-bold text-white text-center mb-6">
              {quizLabel ? `Leaderboard for ${quizLabel.toUpperCase()}` : "Leaderboard"}
            </h2>
            <Leaderboard
              entries={sock.leaderboard}
              totalQuestions={sock.totalQuestions || totalQuestionsInQuiz}
              maxRows={10}
            />
          </div>
        )}
      </div>

      {/* Error */}
      {errorMsg && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-xl text-center mt-4">
          {errorMsg}
        </div>
      )}

      {restoreNotice && (
        <div className="bg-emerald-900/40 border border-emerald-700 text-emerald-100 px-4 py-3 rounded-xl text-center mt-4 text-sm">
          {restoreNotice}
        </div>
      )}

      {/* Control bar (sticky bottom) */}
      <div className="sticky bottom-0 bg-[#0f1117]/90 backdrop-blur-sm border-t border-zinc-800 py-4 -mx-6 px-6 lg:-mx-10 lg:px-10 mt-8">
        <div className="flex items-center justify-center gap-4 flex-wrap">
          {!isReviewing && latestPriorReveal !== undefined && (
            <button
              onClick={() => setReviewQuestionIndex(latestPriorReveal)}
              className="bg-zinc-700 hover:bg-zinc-600 text-white font-semibold py-3 px-8 rounded-xl transition-colors"
            >
              Review Previous
            </button>
          )}
          {isReviewing && reviewQuestionIndex !== null && (
            <button
              onClick={() => {
                const idx = availableRevealIndices.findIndex((v) => v === reviewQuestionIndex);
                if (idx > 0) setReviewQuestionIndex(availableRevealIndices[idx - 1]);
              }}
              disabled={availableRevealIndices.findIndex((v) => v === reviewQuestionIndex) <= 0}
              className="bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold py-3 px-8 rounded-xl transition-colors"
            >
              Prev Review
            </button>
          )}
          {isReviewing && reviewQuestionIndex !== null && (
            <button
              onClick={() => {
                const idx = availableRevealIndices.findIndex((v) => v === reviewQuestionIndex);
                if (idx >= 0 && idx < availableRevealIndices.length - 1) setReviewQuestionIndex(availableRevealIndices[idx + 1]);
              }}
              disabled={availableRevealIndices.findIndex((v) => v === reviewQuestionIndex) >= availableRevealIndices.length - 1}
              className="bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold py-3 px-8 rounded-xl transition-colors"
            >
              Next Review
            </button>
          )}
          {isReviewing && (
            <button
              onClick={() => setReviewQuestionIndex(null)}
              className="bg-zinc-700 hover:bg-zinc-600 text-white font-semibold py-3 px-8 rounded-xl transition-colors"
            >
              Back to Live
            </button>
          )}
          {!isReviewing && canClose && (
            <button
              onClick={() => onAction(() => closeQuestion(sessionId), "close")}
              disabled={loading}
              className="bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 text-white font-semibold py-3 px-8 rounded-xl transition-colors"
            >
              Close Question
            </button>
          )}
          {!isReviewing && canReveal && (
            <button
              onClick={() => onAction(() => revealAnswer(sessionId), "reveal")}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 text-white font-semibold py-3 px-8 rounded-xl transition-colors"
            >
              Reveal Answer
            </button>
          )}
          {!isReviewing && canNext && (
            <button
              onClick={() => onAction(() => nextQuestion(sessionId), "next")}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-semibold py-3 px-8 rounded-xl transition-colors"
            >
              Next Question
            </button>
          )}
          {!isReviewing && canShowLeaderboard && (
            <button
              onClick={() => onAction(() => showLeaderboard(sessionId), "leaderboard")}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 text-white font-semibold py-3 px-8 rounded-xl transition-colors"
            >
              Show Leaderboard
            </button>
          )}
          {!isReviewing && state === "LEADERBOARD" && (
            <button
              onClick={() => {
                if (isFinalQuestion) {
                  setReviewQuestionIndex(liveQuestionIndex);
                  return;
                }
                onAction(() => hideLeaderboard(sessionId), "resume");
              }}
              disabled={loading}
              className="bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-700 text-white font-semibold py-3 px-8 rounded-xl transition-colors"
            >
              Back to Quiz
            </button>
          )}
          {!isReviewing && state === "LEADERBOARD" && (
            <button
              onClick={() => onAction(() => endSession(sessionId), "end")}
              disabled={loading}
              className="bg-red-600 hover:bg-red-500 disabled:bg-zinc-700 text-white font-semibold py-3 px-8 rounded-xl transition-colors"
            >
              End Session
            </button>
          )}
        </div>
      </div>

      {accessInfo && sessionCode && (
        <div className="fixed top-4 right-4 z-20 bg-white text-zinc-900 rounded-xl shadow-xl border border-zinc-200 p-3 w-40">
          {accessInfo.qrCodeDataUrl && (
            <img
              src={accessInfo.qrCodeDataUrl}
              alt="Join QR"
              className="w-full h-auto rounded-lg"
            />
          )}
          <p className="text-[11px] text-zinc-500 mt-2 uppercase tracking-wide">Session Code</p>
          <p className="font-mono text-xl font-bold tracking-[0.12em]">{sessionCode}</p>
          <p className="text-[11px] text-zinc-500 mt-1">{sock.participants?.count ?? 0} online</p>
        </div>
      )}
    </div>
  );
}
