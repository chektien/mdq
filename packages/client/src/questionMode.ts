export function getQuestionModeText(allowsMultiple: boolean, isPoll: boolean): string {
  if (isPoll) {
    return allowsMultiple
      ? "Poll question. You can select multiple options. This does not affect your score."
      : "Poll question. Select one option. This does not affect your score.";
  }

  return allowsMultiple
    ? "You can select multiple answers"
    : "Select only one answer";
}

export function getRevealActionLabel(isPoll: boolean): string {
  return isPoll ? "Show Poll Results" : "Reveal Answer";
}
