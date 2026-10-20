import { lineCol } from "./source";

export type Kind = "object" | "array" | "string" | "number" | "true" | "false" | "null";

export interface Node {
  kind: Kind;
  start: number;
  end: number;
  items: Item[];
}

export interface Item {
  start: number;
  key: string | null;
  keyStart: number;
  value: Node;
  comma: number | null;
}

export class SyntaxProblem extends Error {
  readonly code: string;
  readonly at: number;

  constructor(code: string, at: number, message: string) {
    super(message);
    this.name = "SyntaxProblem";
    this.code = code;
    this.at = at;
  }
}

export function problemLine(text: string, problem: SyntaxProblem): string {
  const [line, column] = lineCol(text, problem.at);
  return `${problem.code} ${problem.message} at ${line}:${column}`;
}

export function countValues(root: Node): number {
  let count = 1;

  for (const item of root.items) {
    count += countValues(item.value);
  }

  return count;
}
