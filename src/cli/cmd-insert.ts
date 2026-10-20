import { Fail } from "../base/fail";
import { type Io, readText } from "../base/inputs";
import { insertValue } from "../edit/change";
import { applyEdits } from "../edit/splice";
import { inferLayout } from "../layout/layout";
import { parseSteps } from "../path/steps";
import { parseDocument } from "../syntax/parser";
import { type Node, problemLine, SyntaxProblem } from "../syntax/tree";

export const USAGE = "jsonsplice insert FILE PATH VALUE [--write]";
export const ARGS = ["FILE", "PATH", "VALUE"];
export const MAX = 3;
export const SPECS: string[] = ["--write"];

export function runInsert(
  args: string[],
  flags: Set<string>,
  io: Io,
): { out: string; code: number } {
  const file = args[0] ?? "";

  if (flags.has("--write") && file === "-") {
    throw new Fail("--write needs a file, not -");
  }

  const source = readText(io, file);
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
  const valueText = args[2] ?? "";
  let value: Node;

  try {
    value = parseDocument(valueText, true);
  } catch (error) {
    if (!(error instanceof SyntaxProblem)) {
      throw error;
    }

    throw new Fail(`invalid value: ${problemLine(valueText, error)}`);
  }

  const layout = inferLayout(source.text, root);
  const edits = insertValue(source.text, root, steps, { src: valueText, node: value }, layout);
  const changed = applyEdits(source.text, edits);
  const output = source.bom ? `\uFEFF${changed}` : changed;

  if (!flags.has("--write")) {
    return { out: output, code: 0 };
  }

  try {
    io.writeFile(file, new TextEncoder().encode(output));
  } catch {
    throw new Fail(`${source.display}: cannot write the file`);
  }

  return { out: "", code: 0 };
}
