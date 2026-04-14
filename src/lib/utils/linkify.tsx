import type { MouseEvent, ReactNode } from 'react';

const URL_REGEX =
  /(?:https?:\/\/|www\.)(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s<)}\]]*)?/g;

/**
 * Splits text on URLs and returns an array of React nodes where
 * bare URLs become clickable <a> tags and everything else stays as text.
 * Meant to be composed with decodeHtmlEntities (decode first, then linkify).
 */
export function linkifyText(
  text: string,
  opts?: { className?: string }
): ReactNode[] {
  if (!text) return [text];

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(text)) !== null) {
    const url = match[0];
    const start = match.index;

    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }

    const href = url.startsWith('http') ? url : `https://${url}`;
    const linkClass = opts?.className ?? 'underline break-all';

    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    nodes.push(
      <a
        key={start}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        {url}
      </a>
    );

    lastIndex = start + url.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}
