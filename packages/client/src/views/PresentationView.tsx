import { useEffect, useMemo, useState } from "react";
import type { SessionState } from "@mdq/shared";
import { fetchPresentationSession, type PresentationSessionResponse } from "../hooks/api";
import { useSocket, type QuestionState, type RevealState } from "../hooks/useSocket";
import Timer from "../components/Timer";
import DistributionChart from "../components/DistributionChart";
import Leaderboard from "../components/Leaderboard";
import QRPanel from "../components/QRPanel";
import QuizHtml from "../components/QuizHtml";
import { getQuestionModeText } from "../questionMode";

function formatQuizLabel(quizKey: string): string {
  const normalized = quizKey.trim();
  if (!normalized) return "MDQ";
  if (/\bmdq\b/i.test(normalized)) return normalized;
  return `${normalized} MDQ`;
}

export default function PresentationView({ sessionId }: { sessionId: string }) {
  const [meta, setMeta] = useState<PresentationSessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const sock = useSocket(sessionId, "presentation");

  useEffect(() => {
    let cancelled = false;

    fetchPresentationSession(sessionId)
      .then((data) => {
        if (cancelled) return;
        setMeta(data);
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMsg(error instanceof Error ? error.message : "Unable to load presentation session.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      sock.disconnect();
    };
  }, [sessionId]);

  const state = (sock.sessionState || meta?.state || null) as SessionState | null;
  const quizLabel = formatQuizLabel(meta?.week || "");
  const accessInfo = meta?.accessInfo || null;
  const questionHeadings = meta?.questionHeadings || [];
  const totalQuestions = meta?.questionCount || 0;
  const currentQuestion = sock.currentQuestion as QuestionState | null;
  const reveal = sock.reveal as RevealState | null;

  const currentHeading = useMemo(() => {
    if (!currentQuestion) return null;
    return questionHeadings[currentQuestion.questionIndex] || currentQuestion.topic || null;
  }, [currentQuestion, questionHeadings]);

  const nextHeading = useMemo(() => {
    if (!currentQuestion) return questionHeadings[0] || null;
    return questionHeadings[currentQuestion.questionIndex + 1] || null;
  }, [currentQuestion, questionHeadings]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 text-zinc-300">
        Loading presentation mode...
      </div>
    );
  }

  if (errorMsg || !meta || !state) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-3xl font-bold text-white">Presentation unavailable</h1>
        <p className="max-w-lg text-zinc-400">{errorMsg || "The presentation session could not be loaded."}</p>
        <a href="#/" className="rounded-xl bg-zinc-800 px-6 py-3 font-semibold text-white transition-colors hover:bg-zinc-700">
          Back home
        </a>
      </div>
    );
  }

  if (state === "LOBBY") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-8 p-8">
        <div className="text-center">
          <p className="text-sm uppercase tracking-[0.22em] text-zinc-500">Presentation Mode</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Waiting for Students</h1>
          <p className="mt-3 text-zinc-400">Read-only projector view, controls stay on the instructor device.</p>
        </div>

        {accessInfo && (
          <QRPanel
            qrDataUrl={accessInfo.qrCodeDataUrl}
            fullUrl={accessInfo.fullUrl}
            shortUrl={accessInfo.shortUrl}
            sessionCode={meta.sessionCode}
          />
        )}

        <div className="text-center">
          <span className="text-5xl font-bold text-white tabular-nums">{sock.participants?.count ?? 0}</span>
          <span className="ml-2 text-lg text-zinc-400">students joined</span>
        </div>

        {sock.participants && sock.participants.count > 0 && (
          <div className="max-h-48 w-full max-w-lg overflow-y-auto rounded-xl bg-zinc-800/50 p-4">
            <div className="flex flex-wrap gap-2">
              {sock.participants.participants.map((participant) => (
                <span key={participant.studentId} className="rounded-full bg-zinc-700 px-3 py-1 text-sm text-zinc-200">
                  {participant.displayName || participant.studentId}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (state === "ENDED") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-8 p-8">
        <div className="text-center">
          <p className="text-sm uppercase tracking-[0.22em] text-zinc-500">Presentation Mode</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Session Ended</h1>
        </div>
        <Leaderboard entries={sock.leaderboard} totalQuestions={sock.totalQuestions || totalQuestions} maxRows={15} />
      </div>
    );
  }

  return (
    <div className={`min-h-dvh flex flex-col p-6 lg:p-10 ${accessInfo && meta.sessionCode ? "lg:pr-56" : ""}`}>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {currentQuestion && (
            <span className="text-lg font-medium text-zinc-400">
              Q{currentQuestion.questionIndex + 1}/{totalQuestions}
            </span>
          )}
          {currentHeading && <span className="text-sm text-zinc-600">{currentHeading}</span>}
        </div>
        <div className="flex items-center gap-4">
          {sock.answerCount && (state === "QUESTION_OPEN" || state === "QUESTION_CLOSED") && (
            <span className="font-mono tabular-nums text-zinc-400">
              {sock.answerCount.submitted}/{sock.answerCount.total} answered
            </span>
          )}
          <span className="tabular-nums text-zinc-500">{sock.participants?.count ?? 0} online</span>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-8">
        {nextHeading && state !== "LEADERBOARD" && (
          <div className="w-full max-w-3xl rounded-2xl border border-sky-500/30 bg-sky-500/10 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-200/80">Next up</p>
            <p className="mt-2 text-lg text-sky-50">{nextHeading}</p>
          </div>
        )}

        {currentQuestion && (state === "QUESTION_OPEN" || state === "QUESTION_CLOSED") && (
          <>
            {state === "QUESTION_OPEN" && (
              <Timer remainingSec={sock.remainingSec} totalSec={currentQuestion.timeLimitSec} size={140} />
            )}
            {state === "QUESTION_CLOSED" && <div className="text-2xl font-bold text-amber-400">Time&apos;s up</div>}

            <QuizHtml
              className="quiz-html max-w-3xl text-center text-2xl leading-relaxed text-white lg:text-3xl"
              html={currentQuestion.text}
            />

            <div className={`selection-mode-chip ${currentQuestion.allowsMultiple ? "selection-mode-chip-multi" : "selection-mode-chip-single"}`}>
              {getQuestionModeText(currentQuestion.allowsMultiple, currentQuestion.isPoll)}
            </div>

            <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
              {currentQuestion.options.map((option) => (
                <div key={option.label} className="flex items-start gap-3 rounded-xl border border-zinc-700 bg-zinc-800 px-5 py-4">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center bg-zinc-700 text-lg font-bold text-zinc-300 ${currentQuestion.allowsMultiple ? "rounded-lg" : "rounded-full"}`}>
                    {option.label}
                  </span>
                  <QuizHtml className="quiz-html text-lg text-zinc-200" html={option.text} as="span" />
                </div>
              ))}
            </div>

            {state === "QUESTION_CLOSED" && sock.distribution && (
              <div className="mt-4 w-full max-w-2xl">
                <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">Response Distribution</h3>
                <DistributionChart
                  distribution={sock.distribution.distribution}
                  labels={currentQuestion.options.map((option) => option.label)}
                  totalResponses={sock.answerCount?.submitted}
                />
              </div>
            )}
          </>
        )}

        {reveal && currentQuestion && state === "REVEAL" && (
          <>
            <QuizHtml
              className="quiz-html max-w-3xl text-center text-xl leading-relaxed text-zinc-300 lg:text-2xl"
              html={currentQuestion.text}
            />

            <div className="w-full max-w-2xl space-y-2">
              {currentQuestion.options.map((option) => {
                const isCorrect = reveal.correctOptions.includes(option.label);
                const rowClass = reveal.isPoll
                  ? "border-zinc-800 bg-zinc-900/60"
                  : isCorrect
                    ? "border-emerald-500/60 bg-emerald-600/15"
                    : "border-zinc-800 bg-zinc-900/60";
                const markerClass = reveal.isPoll
                  ? "bg-zinc-700 text-zinc-300"
                  : isCorrect
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-700 text-zinc-300";
                const textClass = reveal.isPoll
                  ? "text-zinc-200"
                  : isCorrect
                    ? "text-emerald-100"
                    : "text-zinc-200";
                return (
                  <div
                    key={option.label}
                    className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${rowClass}`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-bold ${markerClass}`}>
                      {option.label}
                    </span>
                    <QuizHtml className={`quiz-html pt-0.5 ${textClass}`} html={option.text} as="span" />
                  </div>
                );
              })}
            </div>

            {reveal.isPoll && (
              <div className="w-full max-w-2xl">
                <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">Poll Results</h3>
                <DistributionChart
                  distribution={reveal.distribution}
                  labels={currentQuestion.options.map((option) => option.label)}
                  totalResponses={Object.values(reveal.distribution).reduce((sum, count) => sum + count, 0)}
                />
              </div>
            )}

            {reveal.explanation && (
              <div className="w-full max-w-2xl rounded-xl border border-emerald-700/50 bg-emerald-900/30 p-6">
                <h3 className="mb-2 font-semibold text-emerald-400">Explanation</h3>
                <p className="text-lg leading-relaxed text-emerald-100">{reveal.explanation}</p>
              </div>
            )}
          </>
        )}

        {state === "LEADERBOARD" && (
          <div className="w-full">
            <h2 className="mb-6 text-center text-2xl font-bold text-white">
              {quizLabel ? `Leaderboard for ${quizLabel.toUpperCase()}` : "Leaderboard"}
            </h2>
            <Leaderboard entries={sock.leaderboard} totalQuestions={sock.totalQuestions || totalQuestions} maxRows={10} />
          </div>
        )}
      </div>

      {sock.error && (
        <div className="mt-4 rounded-xl border border-red-700 bg-red-900/50 px-4 py-3 text-center text-red-200">
          {sock.error}
        </div>
      )}

      {accessInfo && meta.sessionCode && (
        <div className="fixed right-4 top-4 z-20 w-40 rounded-xl border border-zinc-200 bg-white p-3 text-zinc-900 shadow-xl">
          {accessInfo.qrCodeDataUrl && <img src={accessInfo.qrCodeDataUrl} alt="Join QR" className="h-auto w-full rounded-lg" />}
          <p className="mt-2 text-[11px] uppercase tracking-wide text-zinc-500">Session Code</p>
          <p className="font-mono text-xl font-bold tracking-[0.12em]">{meta.sessionCode}</p>
          <p className="mt-1 text-[11px] text-zinc-500">{sock.participants?.count ?? 0} online</p>
        </div>
      )}
    </div>
  );
}
