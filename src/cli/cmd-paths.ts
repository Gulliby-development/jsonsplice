import { Fail } from "../base/fail";
import { type Io, readText } from "../base/inputs";
import { line, table } from "../base/text";
import { listing } from "../path/resolve";
import { parseSteps } from "../path/steps";
import { parseDocument } from "../syntax/parser";
import { type Node, problemLine, SyntaxProblem } from "../syntax/tree";

export const USAGE: string = "jsonsplice paths FILE [PATH]";
export const ARGS: string[] = ["FILE"];
export const MAX: number = 2;
export const SPECS: string[] = [];

export function runPaths(
  args: string[],
  _flags: Set<string>,
  io: Io,
): { out: string; code: number } {
  const source = readText(io, args[0]);
  let root: Node;

  try {
    root = parseDocument(source.text, false);
  } catch (error) {
    if (!(error instanceof SyntaxProblem)) {
      throw error;
    }
    throw new Fail(`${source.display}: ${problemLine(source.text, error)}`);
  }

  const path = args[1];
  const steps = path === undefined ? [] : parseSteps(path);
  const rows = listing(source.text, root, steps);

  if (rows.length === 0) {
    return { out: "", code: 1 };
  }

  return {
    out:
      table(["path", "kind", "line", "col", "value"], rows) + line("values", String(rows.length)),
    code: 0,
  };
}
