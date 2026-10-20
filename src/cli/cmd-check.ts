import { type Io, readText } from "../base/inputs";
import { plural } from "../base/text";
import { duplicateKeys, parseDocument } from "../syntax/parser";
import { countValues, type Node, problemLine, SyntaxProblem } from "../syntax/tree";

export const USAGE = "jsonsplice check FILE";
export const ARGS = ["FILE"];
export const MAX = 1;
export const SPECS: string[] = [];

export function runCheck(
  args: string[],
  _flags: Set<string>,
  io: Io,
): { out: string; code: number } {
  const source = readText(io, args[0] ?? "");
  let root: Node;

  try {
    root = parseDocument(source.text, false);
  } catch (error) {
    if (!(error instanceof SyntaxProblem)) {
      throw error;
    }

    return {
      out: `${problemLine(source.text, error)}\n1 problem\n`,
      code: 1,
    };
  }

  const duplicates = duplicateKeys(source.text, root);
  if (duplicates.length > 0) {
    return {
      out: `${duplicates.join("\n")}\n${plural(duplicates.length, "problem")}\n`,
      code: 1,
    };
  }

  return {
    out: `ok, ${plural(countValues(root), "value")}\n`,
    code: 0,
  };
}
