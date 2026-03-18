import type { QuestionType } from "@mdq/shared";

export function getQuestionModeText(questionType: QuestionType, allowsMultiple: boolean): string {
  if (questionType === "poll") {
    return allowsMultiple
      ? "Poll question. You can select multiple options. This does not affect your score."
      : "Poll question. Select one option. This does not affect your score.";
  }

  if (questionType === "open_response") {
    return "Open response. Submit one written reply. This does not affect your score.";
  }

  return allowsMultiple
    ? "You can select multiple answers"
    : "Select only one answer";
}

export function getRevealActionLabel(questionType: QuestionType): string {
  if (questionType === "poll") {
    return "Show Poll Results";
  }
  if (questionType === "open_response") {
    return "Reveal Responses";
  }
  return "Reveal Answer";
}
