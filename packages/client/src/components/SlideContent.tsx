import type {
  FoldoutNote as FoldoutNoteModel,
  SlideMedia,
  SlideReference,
} from "@mdq/shared";
import FoldoutNote from "./FoldoutNote";
import { ExpandableImage } from "./ImageExpansion";
import LiveSurface, { type LiveSurfaceAction } from "./LiveSurface";
import QuizHtml from "./QuizHtml";

interface SlideContentBodyProps {
  title: string;
  html: string;
  attendeeNotes?: FoldoutNoteModel[];
  presenterNotes?: FoldoutNoteModel[];
  slideMedia?: SlideMedia[];
  slideReferences?: SlideReference[];
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
  slideMedia = [],
  slideReferences = [],
  chromeLabel = null,
}: SlideContentBodyProps) {
  const hasAttendeeNotes = attendeeNotes.length > 0;
  const hasPresenterNotes = presenterNotes.length > 0;
  const hasMedia = slideMedia.length > 0;
  const hasReferences = slideReferences.length > 0;
  const hasBody = html.trim().length > 0;
  const mediaCountClass = slideMedia.length > 3
    ? "slide-media-grid-count-many"
    : `slide-media-grid-count-${slideMedia.length}`;

  return (
    <>
      <header className="slide-header">
        {chromeLabel && <p className="slide-eyebrow">{chromeLabel}</p>}
        <h1 className="slide-title">{title}</h1>
      </header>

      <div className={[
        "slide-content-grid",
        hasMedia ? "slide-content-grid-with-media" : "slide-content-grid-text-only",
        !hasBody && hasMedia ? "slide-content-grid-media-only" : null,
      ].filter(Boolean).join(" ")}>
        {hasBody && <QuizHtml className="quiz-html slide-body slide-content-text" html={html} />}

        {hasMedia && (
          <div className={`slide-media-grid ${mediaCountClass}`} aria-label="Slide images">
            {slideMedia.map((media, index) => {
              const caption = media.title || media.alt;
              return (
                <figure className="slide-media-figure" key={`${media.src}-${index}`}>
                  <ExpandableImage
                    className="slide-media-expand-button"
                    src={media.src}
                    alt={media.alt}
                    title={media.title}
                  />
                  {caption && <figcaption>{caption}</figcaption>}
                </figure>
              );
            })}
          </div>
        )}
      </div>

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

      {hasReferences && (
        <footer className="slide-references" aria-label="Slide references">
          <ol>
            {slideReferences.map((reference) => (
              <li key={reference.id}>
                <QuizHtml className="slide-reference-text" html={reference.html} as="span" />
              </li>
            ))}
          </ol>
        </footer>
      )}
    </>
  );
}

export default function SlideContent({
  title,
  html,
  attendeeNotes = [],
  presenterNotes = [],
  slideMedia = [],
  slideReferences = [],
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
        slideMedia={slideMedia}
        slideReferences={slideReferences}
        chromeLabel={chromeLabel}
      />
    </LiveSurface>
  );
}
