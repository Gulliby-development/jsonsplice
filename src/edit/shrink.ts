import { breakLength, lineStart, startsLine, tailEnd } from "../syntax/source";
import type { Node } from "../syntax/tree";
import type { Edit } from "./splice";

export function removeItem(text: string, container: Node, index: number): Edit[] {
  const current = container.items[index];

  if (current === undefined) {
    return [];
  }

  const after = current.comma === null ? current.value.end : current.comma + 1;

  if (startsLine(text, current.start)) {
    const tail = tailEnd(text, after);

    if (tail.ok) {
      const edits: Edit[] = [
        {
          start: lineStart(text, current.start),
          end: tail.end + breakLength(text, tail.end),
          text: "",
        },
      ];

      const isLast = index === container.items.length - 1;
      const isNotFirst = index > 0;

      if (isLast && current.comma === null && isNotFirst) {
        const previous = container.items[index - 1];

        if (previous?.comma !== null && previous?.comma !== undefined) {
          edits.push({ start: previous.comma, end: previous.comma + 1, text: "" });
        }
      }

      return edits;
    }
  }

  const next = container.items[index + 1];

  if (next !== undefined) {
    return [{ start: current.start, end: next.start, text: "" }];
  }

  const previous = container.items[index - 1];

  if (previous !== undefined) {
    return [{ start: previous.value.end, end: current.value.end, text: "" }];
  }

  return [{ start: current.start, end: after, text: "" }];
}
