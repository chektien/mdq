import { useState, useEffect, useCallback } from "react";
import { useSocket } from "../hooks/useSocket";
import type { QuestionState, RevealState } from "../hooks/useSocket";
import {
  fetchQuizzes,
  createSession,
  startSession,
  nextQuestion,
  closeQuestion,
  revealAnswer,
  endSession,
  showLeaderboard,
  fetchAccessInfo,
  type QuizSummary,
  type CreateSessionResponse,
} from "../hooks/api";
import type { AccessInfo, SessionState } from "@md-quiz/shared";
import Timer from "../components/Timer";
import DistributionChart from "../components/DistributionChart";
import Leaderboard from "../components/Leaderboard";
import QRPanel from "../components/QRPanel";

type InstructorPhase = "setup" | "lobby" | "live" | "ended";

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
      setPhase("lobby");

      // Fetch access info for QR/URL display
      try {
        const ai = await fetchAccessInfo();
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

  const handleAction = useCallback(
    async (action: () => Promise<unknown>, label: string) => {
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

        {quizzes.length === 0 ? (
          <p className="text-zinc-400">No quizzes found. Add quiz markdown files to the data/quizzes directory.</p>
        ) : (
          <div className="w-full max-w-md space-y-6">
            <div>
              <label className="block text-zinc-400 text-sm mb-2 font-medium">Select Quiz</label>
              <select
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {quizzes.map((q) => (
                  <option key={q.week} value={q.week}>
                    {q.title} ({q.questionCount} questions)
                  </option>
                ))}
              </select>
            </div>
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
      totalQuestionsInQuiz={totalQuestionsInQuiz}
      loading={loading}
      errorMsg={errorMsg}
      onAction={handleAction}
    />
  );
}

// ── Live sub-view ──────────────────────────

function LiveView({
  sock,
  sessionId,
  totalQuestionsInQuiz,
  loading,
  errorMsg,
  onAction,
}: {
  sock: ReturnType<typeof useSocket>;
  sessionId: string;
  totalQuestionsInQuiz: number;
  loading: boolean;
  errorMsg: string | null;
  onAction: (action: () => Promise<unknown>, label: string) => void;
}) {
  const state = sock.sessionState as SessionState;
  const q = sock.currentQuestion as QuestionState | null;
  const rev = sock.reveal as RevealState | null;

  // Determine which controls to show
  const canClose = state === "QUESTION_OPEN";
  const canReveal = state === "QUESTION_CLOSED";
  const canNext =
    state === "REVEAL" &&
    q &&
    q.questionIndex < totalQuestionsInQuiz - 1;
  const canShowLeaderboard = state === "REVEAL";

  return (
    <div className="min-h-dvh flex flex-col p-6 lg:p-10">
      {/* Top bar: question progress + timer + participant count */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          {q && (
            <span className="text-zinc-400 text-lg font-medium">
              Q{q.questionIndex + 1}/{totalQuestionsInQuiz}
            </span>
          )}
          {q && (
            <span className="text-zinc-600 text-sm">
              {q.topic}
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
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 max-w-4xl mx-auto w-full">
        {/* Question display (for QUESTION_OPEN, QUESTION_CLOSED) */}
        {q && (state === "QUESTION_OPEN" || state === "QUESTION_CLOSED") && (
          <>
            {/* Timer */}
            {state === "QUESTION_OPEN" && (
              <Timer
                remainingSec={sock.remainingSec}
                totalSec={q.timeLimitSec}
                size={140}
              />
            )}
            {state === "QUESTION_CLOSED" && (
              <div className="text-amber-400 text-2xl font-bold">Time's up</div>
            )}

            {/* Question text */}
            <div
              className="quiz-html text-2xl lg:text-3xl text-white text-center leading-relaxed max-w-3xl"
              dangerouslySetInnerHTML={{ __html: q.text }}
            />

            {/* Options (display only, no interaction on instructor) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
              {q.options.map((opt) => (
                <div
                  key={opt.label}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-5 py-4 flex items-start gap-3"
                >
                  <span className="bg-zinc-700 text-zinc-300 font-mono font-bold w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-lg">
                    {opt.label}
                  </span>
                  <span
                    className="quiz-html text-zinc-200 text-lg"
                    dangerouslySetInnerHTML={{ __html: opt.text }}
                  />
                </div>
              ))}
            </div>

            {/* Distribution (visible after close) */}
            {state === "QUESTION_CLOSED" && sock.distribution && (
              <div className="w-full max-w-2xl mt-4">
                <h3 className="text-zinc-400 text-sm uppercase tracking-wide mb-3 font-medium">
                  Response Distribution
                </h3>
                <DistributionChart
                  distribution={sock.distribution.distribution}
                  labels={q.options.map((o) => o.label)}
                />
              </div>
            )}
          </>
        )}

        {/* Reveal view */}
        {rev && state === "REVEAL" && q && (
          <>
            <div
              className="quiz-html text-xl lg:text-2xl text-zinc-300 text-center leading-relaxed max-w-3xl"
              dangerouslySetInnerHTML={{ __html: q.text }}
            />

            <div className="w-full max-w-2xl">
              <DistributionChart
                distribution={rev.distribution}
                correctOptions={rev.correctOptions}
                labels={q.options.map((o) => o.label)}
                showCorrect
              />
            </div>

            {rev.explanation && (
              <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-xl p-6 max-w-2xl w-full">
                <h3 className="text-emerald-400 font-semibold mb-2">Explanation</h3>
                <p className="text-emerald-100 text-lg leading-relaxed">{rev.explanation}</p>
              </div>
            )}
          </>
        )}

        {/* Leaderboard view */}
        {state === "LEADERBOARD" && (
          <div className="w-full">
            <h2 className="text-2xl font-bold text-white text-center mb-6">Leaderboard</h2>
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

      {/* Control bar (sticky bottom) */}
      <div className="sticky bottom-0 bg-[#0f1117]/90 backdrop-blur-sm border-t border-zinc-800 py-4 -mx-6 px-6 lg:-mx-10 lg:px-10 mt-8">
        <div className="flex items-center justify-center gap-4 flex-wrap">
          {canClose && (
            <button
              onClick={() => onAction(() => closeQuestion(sessionId), "close")}
              disabled={loading}
              className="bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 text-white font-semibold py-3 px-8 rounded-xl transition-colors"
            >
              Close Question
            </button>
          )}
          {canReveal && (
            <button
              onClick={() => onAction(() => revealAnswer(sessionId), "reveal")}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 text-white font-semibold py-3 px-8 rounded-xl transition-colors"
            >
              Reveal Answer
            </button>
          )}
          {canNext && (
            <button
              onClick={() => onAction(() => nextQuestion(sessionId), "next")}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-semibold py-3 px-8 rounded-xl transition-colors"
            >
              Next Question
            </button>
          )}
          {canShowLeaderboard && (
            <button
              onClick={() => onAction(() => showLeaderboard(sessionId), "leaderboard")}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 text-white font-semibold py-3 px-8 rounded-xl transition-colors"
            >
              Show Leaderboard
            </button>
          )}
          {state === "LEADERBOARD" && (
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
    </div>
  );
}
