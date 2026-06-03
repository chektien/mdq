import type { FoldoutNote as FoldoutNoteModel } from "@mdq/shared";
import QuizHtml from "./QuizHtml";

export default function FoldoutNote({ note }: { note: FoldoutNoteModel }) {
  const label = note.audience === "presenter" ? "Presenter note" : "Attendee note";
  const title = note.title?.trim();
  return (
    <details className={`foldout-note foldout-note-${note.audience}`}>
      <summary>
        <span className="foldout-note-kicker">{label}</span>
        {title && <span>{title}</span>}
      </summary>
      <QuizHtml className="quiz-html foldout-note-body" html={note.bodyHtml} />
    </details>
  );
}
