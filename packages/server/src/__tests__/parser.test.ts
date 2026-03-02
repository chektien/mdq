import { parseQuizMarkdown, QuizParseError } from "../parser";
import { DEFAULT_TIME_LIMIT_SEC } from "@md-quiz/shared";
import * as fs from "fs";
import * as path from "path";

describe("parseQuizMarkdown", () => {
  describe("basic parsing", () => {
    it("parses a single-select question with default time limit", () => {
      const md = `# Test Quiz (1 Question)

---

## Topic: Subtopic

**What is 2 + 2?**

A. 3
B. 4
C. 5
D. 6

> Correct Answer: B. 4
> Overall Feedback: Basic arithmetic.

---
`;
      const result = parseQuizMarkdown(md, "week01-quiz.md");
      expect(result.errors).toHaveLength(0);
      expect(result.quiz).not.toBeNull();
      const q = result.quiz!;
      expect(q.week).toBe("week01");
      expect(q.title).toBe("Test Quiz (1 Question)");
      expect(q.questions).toHaveLength(1);

      const question = q.questions[0];
      expect(question.topic).toBe("Topic");
      expect(question.subtopic).toBe("Subtopic");
      expect(question.options).toHaveLength(4);
      expect(question.correctOptions).toEqual(["B"]);
      expect(question.explanation).toBe("Basic arithmetic.");
      expect(question.timeLimitSec).toBe(DEFAULT_TIME_LIMIT_SEC);
    });

    it("parses time_limit field", () => {
      const md = `# Quiz

---

## Topic

time_limit: 45

**Question?**

A. Yes
B. No

> Correct Answer: A
> Overall Feedback: Explanation.

---
`;
      const result = parseQuizMarkdown(md, "week03-quiz.md");
      expect(result.errors).toHaveLength(0);
      expect(result.quiz!.questions[0].timeLimitSec).toBe(45);
    });

    it("defaults time_limit to 20 when not specified", () => {
      const md = `# Quiz

---

## Topic

**Question?**

A. Yes
B. No

> Correct Answer: A
> Overall Feedback: Explanation.

---
`;
      const result = parseQuizMarkdown(md, "week01-quiz.md");
      expect(result.quiz!.questions[0].timeLimitSec).toBe(20);
    });

    it("parses multi-select questions", () => {
      const md = `# Quiz

---

## Multi Select

**Select all that apply.**

A. First
B. Second
C. Third
D. Fourth

> Correct Answers: A, C
> Overall Feedback: A and C are correct.

---
`;
      const result = parseQuizMarkdown(md, "week01-quiz.md");
      expect(result.errors).toHaveLength(0);
      const q = result.quiz!.questions[0];
      expect(q.correctOptions).toEqual(["A", "C"]);
    });

    it("parses code blocks in question text", () => {
      const md = `# Quiz

---

## Code

Consider:

\`\`\`typescript
const x = 42;
\`\`\`

**What is x?**

A. 42
B. undefined

> Correct Answer: A
> Overall Feedback: x is 42.

---
`;
      const result = parseQuizMarkdown(md, "week01-quiz.md");
      expect(result.errors).toHaveLength(0);
      const q = result.quiz!.questions[0];
      expect(q.textHtml).toContain("code");
      expect(q.textHtml).toContain("const x = 42;");
      expect(q.textMd).toContain("const x = 42;");
    });

    it("parses multiple questions from one file", () => {
      const md = `# Quiz (2 Questions)

---

## Q1

**First?**

A. Yes
B. No

> Correct Answer: A
> Overall Feedback: Yes.

---

## Q2

time_limit: 10

**Second?**

A. Alpha
B. Beta

> Correct Answer: B
> Overall Feedback: Beta.

---
`;
      const result = parseQuizMarkdown(md, "week01-quiz.md");
      expect(result.errors).toHaveLength(0);
      expect(result.quiz!.questions).toHaveLength(2);
      expect(result.quiz!.questions[0].timeLimitSec).toBe(20);
      expect(result.quiz!.questions[1].timeLimitSec).toBe(10);
    });
  });

  describe("stops at Learning Objectives", () => {
    it("stops parsing at ## Learning Objectives", () => {
      const md = `# Quiz

---

## Q1

**Question?**

A. Yes
B. No

> Correct Answer: A
> Overall Feedback: Yes.

---

## Learning Objectives

- Objective 1
- Objective 2
`;
      const result = parseQuizMarkdown(md, "week01-quiz.md");
      expect(result.quiz!.questions).toHaveLength(1);
    });
  });

  describe("validation errors", () => {
    it("reports missing correct answer", () => {
      const md = `# Quiz

---

## Topic

**Question?**

A. Yes
B. No

> Overall Feedback: Some feedback.

---
`;
      const result = parseQuizMarkdown(md, "test.md");
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBeInstanceOf(QuizParseError);
      expect(result.errors[0].detail).toContain("Missing correct answer");
    });

    it("reports missing options", () => {
      const md = `# Quiz

---

## Topic

**Question with no options?**

> Correct Answer: A
> Overall Feedback: Oops.

---
`;
      const result = parseQuizMarkdown(md, "test.md");
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].detail).toContain("No answer options");
    });

    it("reports correct answer referencing non-existent option", () => {
      const md = `# Quiz

---

## Topic

**Question?**

A. Yes
B. No

> Correct Answer: C
> Overall Feedback: C does not exist.

---
`;
      const result = parseQuizMarkdown(md, "test.md");
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].detail).toContain('does not match any option label');
    });

    it("handles unterminated code block gracefully", () => {
      const md = `# Quiz

---

## Topic

\`\`\`python
def foo():
    pass

**No closing fence -- question text continues**

A. Yes
B. No

> Correct Answer: A
> Overall Feedback: Code block never closed.

---
`;
      // Should not crash -- parser may treat everything as code or produce an error,
      // but must not throw an unhandled exception
      const result = parseQuizMarkdown(md, "test.md");
      // The parser might produce a valid quiz or an error, but it must not crash
      expect(result).toBeDefined();
      expect(result.errors).toBeDefined();
    });

    it("handles empty question text with options", () => {
      const md = `# Quiz

---

## Topic

A. Yes
B. No

> Correct Answer: A
> Overall Feedback: Just options, no question text.

---
`;
      const result = parseQuizMarkdown(md, "test.md");
      expect(result.errors).toHaveLength(0);
      expect(result.quiz!.questions[0].textMd).toBe("");
    });

    it("reports no questions found in empty file", () => {
      const md = `# Just a title with no questions`;
      const result = parseQuizMarkdown(md, "empty.md");
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].detail).toContain("No questions found");
      expect(result.quiz).toBeNull();
    });

    it("returns partial results when some questions are valid", () => {
      const md = `# Quiz

---

## Good Question

**What?**

A. Yes
B. No

> Correct Answer: A
> Overall Feedback: Fine.

---

## Bad Question

**No options here.**

> Correct Answer: A
> Overall Feedback: Oops.

---
`;
      const result = parseQuizMarkdown(md, "test.md");
      expect(result.quiz!.questions).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe("sample quiz files", () => {
    const quizDir = path.join(__dirname, "../../../../data/quizzes");

    it("parses week01-quiz.md", () => {
      const md = fs.readFileSync(path.join(quizDir, "week01-quiz.md"), "utf-8");
      const result = parseQuizMarkdown(md, "week01-quiz.md");
      expect(result.errors).toHaveLength(0);
      expect(result.quiz!.questions).toHaveLength(3);
      expect(result.quiz!.questions[0].timeLimitSec).toBe(30);
      expect(result.quiz!.questions[1].timeLimitSec).toBe(20); // default
      expect(result.quiz!.questions[2].timeLimitSec).toBe(45);
      expect(result.quiz!.questions[2].correctOptions).toEqual(["A", "B", "D"]);
    });

    it("parses week02-quiz.md", () => {
      const md = fs.readFileSync(path.join(quizDir, "week02-quiz.md"), "utf-8");
      const result = parseQuizMarkdown(md, "week02-quiz.md");
      expect(result.errors).toHaveLength(0);
      expect(result.quiz!.questions).toHaveLength(2);
      expect(result.quiz!.questions[1].timeLimitSec).toBe(25);
    });
  });
});
