import { parseQuizMarkdown, QuizParseError } from "../parser";
import { DEFAULT_TIME_LIMIT_SEC } from "@mdq/shared";
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
      const result = parseQuizMarkdown(md, "week01.md");
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
      expect(question.allowsMultiple).toBe(false);
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
      const result = parseQuizMarkdown(md, "week03.md");
      expect(result.errors).toHaveLength(0);
      expect(result.quiz!.questions[0].timeLimitSec).toBe(45);
    });

    it("defaults time_limit to 35 when not specified", () => {
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
      const result = parseQuizMarkdown(md, "week01.md");
      expect(result.quiz!.questions[0].timeLimitSec).toBe(35);
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
      const result = parseQuizMarkdown(md, "week01.md");
      expect(result.errors).toHaveLength(0);
      const q = result.quiz!.questions[0];
      expect(q.correctOptions).toEqual(["A", "C"]);
      expect(q.allowsMultiple).toBe(true);
    });

    it("supports explicit multi_select for single-answer questions", () => {
      const md = `# Quiz

---

## Multi Select Mode

multi_select: true

**Pick any options you think fit.**

A. First
B. Second
C. Third

> Correct Answer: B
> Overall Feedback: Only B is graded as correct.

---
`;
      const result = parseQuizMarkdown(md, "week01.md");
      expect(result.errors).toHaveLength(0);
      expect(result.quiz!.questions[0].allowsMultiple).toBe(true);
    });

    it("parses poll questions without correct answers", () => {
      const md = `# Quiz

---

## Live Poll

question_type: poll

**How are you feeling about the topic?**

A. Great
B. Okay
C. Lost

> Overall Feedback: Thanks for the signal.

---
`;
      const result = parseQuizMarkdown(md, "week01.md");
      expect(result.errors).toHaveLength(0);
      const q = result.quiz!.questions[0];
      expect(q.isPoll).toBe(true);
      expect(q.correctOptions).toEqual([]);
      expect(q.allowsMultiple).toBe(false);
    });

    it("supports multi-select poll questions", () => {
      const md = `# Quiz

---

## Live Poll

question_type: poll
multi_select: true

**Which topics need more revision?**

A. Testing
B. Networking
C. Git

> Overall Feedback: Thanks for the signal.

---
`;
      const result = parseQuizMarkdown(md, "week01.md");
      expect(result.errors).toHaveLength(0);
      const q = result.quiz!.questions[0];
      expect(q.isPoll).toBe(true);
      expect(q.allowsMultiple).toBe(true);
      expect(q.correctOptions).toEqual([]);
    });

    it("uses full week key from variant filenames", () => {
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
      const result = parseQuizMarkdown(md, "week09-lab.md");
      expect(result.errors).toHaveLength(0);
      expect(result.quiz!.week).toBe("week09-lab");
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
      const result = parseQuizMarkdown(md, "week01.md");
      expect(result.errors).toHaveLength(0);
      const q = result.quiz!.questions[0];
      expect(q.textHtml).toContain("code");
      expect(q.textHtml).toContain("const x = 42;");
      expect(q.textMd).toContain("const x = 42;");
    });

    it("rewrites quiz image paths into the public data images route", () => {
      const md = `# Quiz

---

## Visual Prompt

![](../images/xr-setup.png)

**Which device is shown?**

A. Tablet
B. Router

> Correct Answer: A
> Overall Feedback: The image shows the capture tablet.

---
`;
      const result = parseQuizMarkdown(md, "week01.md");
      expect(result.errors).toHaveLength(0);
      const q = result.quiz!.questions[0];
      expect(q.textHtml).toContain('src="/data/images/xr-setup.png"');
      expect(q.textHtml).toContain('class="quiz-embedded-image"');
    });

    it("rewrites image paths inside answer options too", () => {
      const md = `# Quiz

---

## Visual Options

**Choose the correct device.**

A. ![Correct](../images/devices/tablet.png)
B. ![Incorrect](../images/devices/router.png)

> Correct Answer: A
> Overall Feedback: The tablet is the capture device.

---
`;
      const result = parseQuizMarkdown(md, "week01.md");
      expect(result.errors).toHaveLength(0);
      const q = result.quiz!.questions[0];
      expect(q.options[0].textHtml).toContain('src="/data/images/devices/tablet.png"');
      expect(q.options[1].textHtml).toContain('src="/data/images/devices/router.png"');
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
      const result = parseQuizMarkdown(md, "week01.md");
      expect(result.errors).toHaveLength(0);
      expect(result.quiz!.questions).toHaveLength(2);
      expect(result.quiz!.questions[0].timeLimitSec).toBe(35);
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
      const result = parseQuizMarkdown(md, "week01.md");
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

    it("rejects poll questions that declare correct answers", () => {
      const md = `# Quiz

---

## Invalid Poll

question_type: poll

**How are you feeling?**

A. Great
B. Unsure

> Correct Answer: A

---
`;
      const result = parseQuizMarkdown(md, "test.md");
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBeInstanceOf(QuizParseError);
      expect(result.errors[0].detail).toContain("must not define correct answers");
    });

    it("rejects multi_select false when multiple correct answers are declared", () => {
      const md = `# Quiz

---

## Invalid Config

multi_select: false

**Select all that apply.**

A. First
B. Second
C. Third

> Correct Answers: A, C
> Overall Feedback: A and C are correct.

---
`;
      const result = parseQuizMarkdown(md, "test.md");
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].detail).toContain("multi_select: false");
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
    const quizDir = path.join(__dirname, "fixtures/quizzes");

    it("parses week01.md", () => {
      const md = fs.readFileSync(path.join(quizDir, "week01.md"), "utf-8");
      const result = parseQuizMarkdown(md, "week01.md");
      expect(result.errors).toHaveLength(0);
      expect(result.quiz!.questions).toHaveLength(3);
      expect(result.quiz!.questions[0].timeLimitSec).toBe(30);
      expect(result.quiz!.questions[1].timeLimitSec).toBe(35); // default
      expect(result.quiz!.questions[2].timeLimitSec).toBe(45);
      expect(result.quiz!.questions[2].correctOptions).toEqual(["A", "B", "D"]);
      expect(result.quiz!.questions[2].allowsMultiple).toBe(true);
    });

    it("parses week02.md", () => {
      const md = fs.readFileSync(path.join(quizDir, "week02.md"), "utf-8");
      const result = parseQuizMarkdown(md, "week02.md");
      expect(result.errors).toHaveLength(0);
      expect(result.quiz!.questions).toHaveLength(2);
      expect(result.quiz!.questions[1].timeLimitSec).toBe(25);
    });
  });
});
