import { Quiz, Question } from "@mdq/shared";

export function isPollQuestion(question: Question | null | undefined): boolean {
  return question?.isPoll === true;
}

export function buildScoredCorrectAnswersMap(quiz: Quiz): Map<number, string[]> {
  const correctAnswersMap = new Map<number, string[]>();
  quiz.questions.forEach((question, index) => {
    if (!isPollQuestion(question)) {
      correctAnswersMap.set(index, question.correctOptions);
    }
  });
  return correctAnswersMap;
}

export function getScoredQuestionCount(quiz: Quiz): number {
  return quiz.questions.filter((question) => !isPollQuestion(question)).length;
}
