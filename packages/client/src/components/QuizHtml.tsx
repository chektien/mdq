import { memo } from "react";

function QuizHtml({
  html,
  className,
  as = "div",
}: {
  html: string;
  className: string;
  as?: "div" | "span";
}) {
  const Tag = as;
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default memo(QuizHtml);
