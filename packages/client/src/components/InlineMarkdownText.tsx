import type { ReactNode } from "react";

const INLINE_LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_LINK_PATTERN)) {
    const matchIndex = match.index ?? 0;
    const [raw, rawLabel, href] = match;
    const hasLeadingCitationBracket = rawLabel.startsWith("[");
    const label = hasLeadingCitationBracket ? rawLabel.slice(1) : rawLabel;

    if (matchIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, matchIndex));
    }
    if (hasLeadingCitationBracket) {
      nodes.push("[");
    }

    nodes.push(
      <a
        key={`${href}-${matchIndex}`}
        href={href}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-current/45 underline-offset-2 hover:decoration-current"
      >
        {label}
      </a>,
    );

    lastIndex = matchIndex + raw.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export default function InlineMarkdownText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return <p className={className}>{renderInlineMarkdown(text)}</p>;
}
