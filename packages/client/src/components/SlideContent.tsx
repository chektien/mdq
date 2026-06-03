import type { FoldoutNote as FoldoutNoteModel } from "@mdq/shared";
import FoldoutNote from "./FoldoutNote";
import LiveSurface, { type LiveSurfaceAction } from "./LiveSurface";
import QuizHtml from "./QuizHtml";

interface SlideContentBodyProps {
  title: string;
  html: string;
  attendeeNotes?: FoldoutNoteModel[];
  presenterNotes?: FoldoutNoteModel[];
  chromeLabel?: string | null;
}

interface SlideContentProps extends SlideContentBodyProps {
  positionLabel?: string;
  mode?: "projector" | "review" | "student";
  nextLabel?: string | null;
  qrDataUrl?: string;
  sessionCode?: string;
  participantCount?: number;
  presentationUrl?: string;
  showFullscreenButton?: boolean;
  statusLabel?: string | null;
  statusTone?: "neutral" | "success" | "warning";
  actions?: LiveSurfaceAction[];
}

export function SlideContentBody({
  title,
  html,
  attendeeNotes = [],
  presenterNotes = [],
  chromeLabel = null,
}: SlideContentBodyProps) {
  const hasAttendeeNotes = attendeeNotes.length > 0;
  const hasPresenterNotes = presenterNotes.length > 0;

  return (
    <>
      <header className="slide-header">
        {chromeLabel && <p className="slide-eyebrow">{chromeLabel}</p>}
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
    </>
  );
}

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
  statusLabel,
  statusTone,
  chromeLabel = null,
  actions = [],
}: SlideContentProps) {
  return (
    <LiveSurface
      mode={mode}
      nextLabel={nextLabel}
      qrDataUrl={qrDataUrl}
      sessionCode={sessionCode}
      participantCount={participantCount}
      presentationUrl={presentationUrl}
      positionLabel={positionLabel}
      showFullscreenButton={showFullscreenButton}
      statusLabel={statusLabel}
      statusTone={statusTone}
      actions={actions}
    >
      <SlideContentBody
        title={title}
        html={html}
        attendeeNotes={attendeeNotes}
        presenterNotes={presenterNotes}
        chromeLabel={chromeLabel}
      />
    </LiveSurface>
  );
}
