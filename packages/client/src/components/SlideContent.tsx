import { useRef } from "react";
import type { FoldoutNote as FoldoutNoteModel } from "@mdq/shared";
import FoldoutNote from "./FoldoutNote";
import QuizHtml from "./QuizHtml";

export default function SlideContent({
  title,
  html,
  attendeeNotes = [],
  presenterNotes = [],
  positionLabel,
  mode = "projector",
  nextLabel,
  qrDataUrl,
  sessionCode,
  participantCount,
  presentationUrl,
  showFullscreenButton = true,
}: {
  title: string;
  html: string;
  attendeeNotes?: FoldoutNoteModel[];
  presenterNotes?: FoldoutNoteModel[];
  positionLabel?: string;
  mode?: "projector" | "review" | "student";
  nextLabel?: string | null;
  qrDataUrl?: string;
  sessionCode?: string;
  participantCount?: number;
  presentationUrl?: string;
  showFullscreenButton?: boolean;
}) {
  const surfaceRef = useRef<HTMLElement | null>(null);
  const hasAttendeeNotes = attendeeNotes.length > 0;
  const hasPresenterNotes = presenterNotes.length > 0;
  const hasJoinInfo = qrDataUrl || sessionCode || participantCount !== undefined || presentationUrl;

  const requestFullscreen = async () => {
    const target = surfaceRef.current;
    if (!target || !document.fullscreenEnabled) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await target.requestFullscreen();
      }
    } catch {
      // Fullscreen can be denied by the browser; leave the slide usable.
    }
  };

  return (
    <section ref={surfaceRef} className={`slide-surface slide-surface-${mode}`}>
      <div className="slide-safe">
        <div className="slide-toolbar">
          {nextLabel && (
            <div className="slide-next-up">
              <span>Next up</span>
              <strong>{nextLabel}</strong>
            </div>
          )}
          {showFullscreenButton && document.fullscreenEnabled && (
            <button type="button" className="slide-fullscreen-button" onClick={requestFullscreen}>
              Full screen
            </button>
          )}
        </div>

        <header className="slide-header">
          <p className="slide-eyebrow">Slide</p>
          <h1 className="slide-title">{title}</h1>
        </header>

        <QuizHtml className="quiz-html slide-body" html={html} />

        {(hasAttendeeNotes || hasPresenterNotes) && (
          <div className="slide-notes">
            {hasAttendeeNotes && (
              <div className="slide-note-group slide-note-group-attendee">
                {attendeeNotes.map((note) => (
                  <FoldoutNote key={note.id} note={note} />
                ))}
              </div>
            )}
            {hasPresenterNotes && (
              <div className="slide-note-group slide-note-group-presenter">
                {presenterNotes.map((note) => (
                  <FoldoutNote key={note.id} note={note} />
                ))}
              </div>
            )}
          </div>
        )}

        {hasJoinInfo && (
          <aside className="slide-join-panel" aria-label="Session join details">
            {qrDataUrl && <img src={qrDataUrl} alt="Join QR" />}
            {sessionCode && (
              <>
                <span className="slide-join-label">Session code</span>
                <strong>{sessionCode}</strong>
              </>
            )}
            {participantCount !== undefined && <span className="slide-join-meta">{participantCount} online</span>}
            {presentationUrl && (
              <a href={presentationUrl} target="_blank" rel="noopener noreferrer">
                Presentation view
              </a>
            )}
          </aside>
        )}

        {positionLabel && <p className="slide-counter">{positionLabel}</p>}
      </div>
    </section>
  );
}
