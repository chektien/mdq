import type { FoldoutNote } from "@mdq/shared";
import QuizHtml from "./QuizHtml";

/**
 * Instructor-only presenter-notes panel. Rendered exclusively inside
 * InstructorView, directly below the current slide preview. It is never
 * mounted on the projector, student, or print surfaces, and the notes it
 * renders arrive only from the instructor-authenticated presenter-notes
 * endpoint. The `open` state is lifted to the parent so it persists across
 * Prev/Next navigation; toggling the disclosure never advances the slide.
 */
export default function PresenterNotesPanel({
  notes,
  open,
  onToggle,
  positionLabel,
}: {
  notes: FoldoutNote[];
  open: boolean;
  onToggle: (open: boolean) => void;
  positionLabel?: string | null;
}) {
  if (notes.length === 0) return null;
  return (
    <section className="presenter-notes-panel" aria-label="Presenter notes">
      <details
        className="presenter-notes-details"
        open={open}
        onToggle={(event) => onToggle((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="presenter-notes-summary">
          <span className="presenter-notes-kicker">Presenter notes</span>
          {positionLabel && <span className="presenter-notes-position">{positionLabel}</span>}
          <span className="presenter-notes-hint" aria-hidden="true">instructor only</span>
        </summary>
        <div className="presenter-notes-body">
          {notes.map((note) => (
            <QuizHtml
              key={note.id}
              className="quiz-html presenter-notes-note"
              html={note.bodyHtml}
            />
          ))}
        </div>
      </details>
    </section>
  );
}
