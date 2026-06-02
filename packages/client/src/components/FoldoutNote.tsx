import type { FoldoutNote as FoldoutNoteModel } from "@mdq/shared";
import QuizHtml from "./QuizHtml";

export default function FoldoutNote({ note }: { note: FoldoutNoteModel }) {
  const label = note.audience === "presenter" ? "Presenter note" : "Note";
  return (
    <details className={`foldout-note foldout-note-${note.audience}`}>
      <summary>
        <span className="foldout-note-kicker">{label}</span>
        <span>{note.title || label}</span>
      </summary>
      <QuizHtml className="quiz-html foldout-note-body" html={note.bodyHtml} />
    </details>
  );
}
