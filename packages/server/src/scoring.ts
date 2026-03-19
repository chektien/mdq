import { Quiz, Question, QuestionType } from "@mdq/shared";

export function getQuestionType(question: Question | null | undefined): QuestionType {
  if (!question) {
    return "multiple_choice";
  }
  if (question.questionType) {
    return question.questionType;
  }
  return question.isPoll ? "poll" : "multiple_choice";
}

export function isPollQuestion(question: Question | null | undefined): boolean {
  return getQuestionType(question) === "poll";
}

export function isOpenResponseQuestion(question: Question | null | undefined): boolean {
  return getQuestionType(question) === "open_response";
}

export function isScoredQuestion(question: Question | null | undefined): boolean {
  const type = getQuestionType(question);
  return type === "multiple_choice";
}

export function buildScoredCorrectAnswersMap(quiz: Quiz): Map<number, string[]> {
  const correctAnswersMap = new Map<number, string[]>();
  quiz.questions.forEach((question, index) => {
    if (isScoredQuestion(question)) {
      correctAnswersMap.set(index, question.correctOptions);
    }
  });
  return correctAnswersMap;
}

export function getScoredQuestionCount(quiz: Quiz): number {
  return quiz.questions.filter((question) => isScoredQuestion(question)).length;
}
