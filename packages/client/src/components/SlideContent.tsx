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
}: {
  title: string;
  html: string;
  attendeeNotes?: FoldoutNoteModel[];
  presenterNotes?: FoldoutNoteModel[];
  positionLabel?: string;
  mode?: "projector" | "review" | "student";
}) {
  return (
    <section className={`slide-surface slide-surface-${mode}`}>
      <div className="slide-safe">
        <div>
          <p className="slide-eyebrow">Slide</p>
          <h1 className="slide-title">{title}</h1>
        </div>

        <QuizHtml className="quiz-html slide-body" html={html} />

        {(attendeeNotes.length > 0 || presenterNotes.length > 0) && (
          <div className="slide-notes">
            {attendeeNotes.map((note) => (
              <FoldoutNote key={note.id} note={note} />
            ))}
            {presenterNotes.map((note) => (
              <FoldoutNote key={note.id} note={note} />
            ))}
          </div>
        )}

        {positionLabel && <p className="slide-counter">{positionLabel}</p>}
      </div>
    </section>
  );
}
