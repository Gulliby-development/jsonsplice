import { Fail } from "../base/fail";
import { type Io, readText } from "../base/inputs";
import { layoutRows } from "../layout/layout";
import { parseDocument } from "../syntax/parser";
import { type Node, problemLine, SyntaxProblem } from "../syntax/tree";

export const USAGE: string = "jsonsplice layout FILE";
export const ARGS: string[] = ["FILE"];
export const MAX: number = 1;
export const SPECS: string[] = [];

export function runLayout(
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

  return { out: layoutRows(source.text, root, source.bom), code: 0 };
}
