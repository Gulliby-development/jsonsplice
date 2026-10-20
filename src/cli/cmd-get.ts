import { Fail } from "../base/fail";
import { type Io, readText } from "../base/inputs";
import { lookup } from "../path/resolve";
import { parseSteps } from "../path/steps";
import { parseDocument } from "../syntax/parser";
import { type Node, problemLine, SyntaxProblem } from "../syntax/tree";

export const USAGE = "jsonsplice get FILE PATH";
export const ARGS = ["FILE", "PATH"];
export const MAX = 2;
export const SPECS: string[] = [];

export function runGet(args: string[], _flags: Set<string>, io: Io): { out: string; code: number } {
  const source = readText(io, args[0] ?? "");
  let root: Node;

  try {
    root = parseDocument(source.text, false);
  } catch (error) {
    if (!(error instanceof SyntaxProblem)) {
      throw error;
    }

    throw new Fail(`${source.display}: ${problemLine(source.text, error)}`);
  }

  const steps = parseSteps(args[1] ?? "");
  const selected = lookup(root, steps);

  if (selected === null) {
    return { out: "", code: 1 };
  }

  return { out: `${source.text.slice(selected.start, selected.end)}\n`, code: 0 };
}
