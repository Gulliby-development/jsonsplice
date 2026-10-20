import { line, plural } from "../base/text";
import { baseWs, startsLine } from "../syntax/source";
import type { Node } from "../syntax/tree";

export interface Layout {
  newline: string;
  indent: string;
  trailing: boolean;
  final: boolean;
}

export function inferLayout(text: string, root: Node): Layout {
  const firstLf = text.indexOf("\n");
  const newline = firstLf > 0 && text[firstLf - 1] === "\r" ? "\r\n" : "\n";
  let indent = "  ";

  if ((root.kind === "object" || root.kind === "array") && root.items.length > 0) {
    const firstItem = root.items[0];

    if (firstItem !== undefined && startsLine(text, firstItem.start)) {
      const whitespace = baseWs(text, firstItem.start);

      if (whitespace.length > 0) {
        indent = whitespace;
      }
    }
  }

  const isContainer = root.kind === "object" || root.kind === "array";
  const lastItem = root.items[root.items.length - 1];

  return {
    newline,
    indent,
    trailing: isContainer && root.items.length > 0 && lastItem?.comma !== null,
    final: text.endsWith("\n"),
  };
}

export function layoutRows(text: string, root: Node, bom: boolean): string {
  const layout = inferLayout(text, root);
  const newline = layout.newline === "\r\n" ? "crlf" : "lf";
  let indent: string;

  if (/^ *$/u.test(layout.indent)) {
    indent = plural(layout.indent.length, "space");
  } else if (/^\t*$/u.test(layout.indent)) {
    indent = plural(layout.indent.length, "tab");
  } else {
    indent = "mixed";
  }

  return [
    line("newline", newline),
    line("indent", indent),
    line("trailing", layout.trailing ? "yes" : "no"),
    line("final", layout.final ? "yes" : "no"),
    line("bom", bom ? "yes" : "no"),
  ].join("");
}
