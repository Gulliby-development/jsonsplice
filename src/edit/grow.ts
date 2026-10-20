import type { Layout } from "../layout/layout";
import { baseWs, lineStart, startsLine, tailEnd } from "../syntax/source";
import type { Node } from "../syntax/tree";
import type { Edit } from "./splice";

export function addItem(text: string, container: Node, item: string, layout: Layout): Edit[] {
  const items = container.items;

  if (items.length === 0) {
    const innerStart = container.start + 1;
    const innerEnd = container.end - 1;
    const inner = text.slice(innerStart, innerEnd);

    if (inner.includes("\n")) {
      return [
        {
          start: innerStart,
          end: innerStart,
          text: layout.newline + baseWs(text, container.start) + layout.indent + item,
        },
      ];
    }

    if (/^[ \t]*$/u.test(inner)) {
      return [{ start: innerStart, end: innerEnd, text: item }];
    }

    return [{ start: innerStart, end: innerStart, text: item }];
  }

  const last = items[items.length - 1];

  if (last === undefined) {
    return [];
  }

  const after = last.comma === null ? last.value.end : last.comma + 1;
  const whitespace = baseWs(text, last.start);

  if (startsLine(text, last.start)) {
    const tail = tailEnd(text, after);
    const insertionPoint = tail.ok ? tail.end : after;
    const edits: Edit[] = [];

    if (last.comma === null) {
      edits.push({ start: last.value.end, end: last.value.end, text: "," });
    }

    edits.push({
      start: insertionPoint,
      end: insertionPoint,
      text: layout.newline + whitespace + item + (last.comma === null ? "" : ","),
    });

    return edits;
  }

  if (last.comma === null) {
    return [{ start: last.value.end, end: last.value.end, text: `, ${item}` }];
  }

  const insertionPoint = last.comma + 1;
  return [{ start: insertionPoint, end: insertionPoint, text: ` ${item},` }];
}

export function insertBefore(
  text: string,
  container: Node,
  index: number,
  item: string,
  layout: Layout,
): Edit[] {
  if (index >= container.items.length) {
    return addItem(text, container, item, layout);
  }

  const current = container.items[index];

  if (current === undefined) {
    return [];
  }

  if (startsLine(text, current.start)) {
    const insertionPoint = lineStart(text, current.start);
    const whitespace = baseWs(text, current.start);

    return [
      {
        start: insertionPoint,
        end: insertionPoint,
        text: `${whitespace}${item},${layout.newline}`,
      },
    ];
  }

  return [{ start: current.start, end: current.start, text: `${item}, ` }];
}
