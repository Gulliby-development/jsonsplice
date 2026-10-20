import { show } from "../base/text";
import { readNumber, readString, skipTrivia } from "./scanner";
import { type Item, type Kind, type Node, problemLine, SyntaxProblem } from "./tree";

export function parseDocument(text: string, strict: boolean): Node {
  const start = skipTrivia(text, 0, strict);
  const root = parseValue(text, start, strict, 0);
  const end = skipTrivia(text, root.end, strict);

  if (end < text.length) {
    throw unexpectedCharacter(text, end);
  }

  return root;
}

export function duplicateKeys(text: string, root: Node): string[] {
  const problems: SyntaxProblem[] = [];
  collectDuplicates(root, problems);
  problems.sort((left, right) => left.at - right.at);
  return problems.map((problem) => problemLine(text, problem));
}

function parseValue(text: string, at: number, strict: boolean, containers: number): Node {
  if (at >= text.length) {
    throw unexpectedEnd(text.length);
  }

  const character = text[at];

  if (character === "{") {
    return parseObject(text, at, strict, containers);
  }

  if (character === "[") {
    return parseArray(text, at, strict, containers);
  }

  if (character === '"') {
    return scalar("string", at, readString(text, at).end);
  }

  if (character === "t") {
    return parseLiteral(text, at, "true", "true");
  }

  if (character === "f") {
    return parseLiteral(text, at, "false", "false");
  }

  if (character === "n") {
    return parseLiteral(text, at, "null", "null");
  }

  if (character === "-" || isDigit(character)) {
    return scalar("number", at, readNumber(text, at));
  }

  throw unexpectedCharacter(text, at);
}

function parseObject(text: string, at: number, strict: boolean, containers: number): Node {
  checkDepth(at, containers);

  const items: Item[] = [];
  let position = skipTrivia(text, at + 1, strict);

  if (text[position] === "}") {
    return { kind: "object", start: at, end: position + 1, items };
  }

  while (true) {
    if (position >= text.length) {
      throw unexpectedEnd(text.length);
    }

    if (text[position] !== '"') {
      throw unexpectedCharacter(text, position);
    }

    const keyStart = position;
    const keyToken = readString(text, position);
    position = skipTrivia(text, keyToken.end, strict);

    if (text[position] !== ":") {
      if (position >= text.length) {
        throw unexpectedEnd(text.length);
      }
      throw unexpectedCharacter(text, position);
    }

    position = skipTrivia(text, position + 1, strict);
    const value = parseValue(text, position, strict, containers + 1);
    position = skipTrivia(text, value.end, strict);

    if (text[position] === ",") {
      items.push({
        start: keyStart,
        key: keyToken.value,
        keyStart,
        value,
        comma: position,
      });
      position = skipTrivia(text, position + 1, strict);

      if (text[position] === "}") {
        if (strict) {
          throw unexpectedCharacter(text, position);
        }
        return { kind: "object", start: at, end: position + 1, items };
      }

      continue;
    }

    if (text[position] === "}") {
      items.push({
        start: keyStart,
        key: keyToken.value,
        keyStart,
        value,
        comma: null,
      });
      return { kind: "object", start: at, end: position + 1, items };
    }

    if (position >= text.length) {
      throw unexpectedEnd(text.length);
    }

    throw unexpectedCharacter(text, position);
  }
}

function parseArray(text: string, at: number, strict: boolean, containers: number): Node {
  checkDepth(at, containers);

  const items: Item[] = [];
  let position = skipTrivia(text, at + 1, strict);

  if (text[position] === "]") {
    return { kind: "array", start: at, end: position + 1, items };
  }

  while (true) {
    const value = parseValue(text, position, strict, containers + 1);
    position = skipTrivia(text, value.end, strict);

    if (text[position] === ",") {
      items.push({
        start: value.start,
        key: null,
        keyStart: value.start,
        value,
        comma: position,
      });
      position = skipTrivia(text, position + 1, strict);

      if (text[position] === "]") {
        if (strict) {
          throw unexpectedCharacter(text, position);
        }
        return { kind: "array", start: at, end: position + 1, items };
      }

      continue;
    }

    if (text[position] === "]") {
      items.push({
        start: value.start,
        key: null,
        keyStart: value.start,
        value,
        comma: null,
      });
      return { kind: "array", start: at, end: position + 1, items };
    }

    if (position >= text.length) {
      throw unexpectedEnd(text.length);
    }

    throw unexpectedCharacter(text, position);
  }
}

function parseLiteral(text: string, at: number, literal: string, kind: Kind): Node {
  for (let index = 0; index < literal.length; index += 1) {
    const position = at + index;

    if (position >= text.length) {
      throw unexpectedEnd(text.length);
    }

    if (text[position] !== literal[index]) {
      throw unexpectedCharacter(text, position);
    }
  }

  return scalar(kind, at, at + literal.length);
}

function scalar(kind: Kind, start: number, end: number): Node {
  return { kind, start, end, items: [] };
}

function checkDepth(at: number, containers: number): void {
  if (containers >= 64) {
    throw new SyntaxProblem("JS008", at, "nesting too deep");
  }
}

function unexpectedEnd(at: number): SyntaxProblem {
  return new SyntaxProblem("JS002", at, "unexpected end of input");
}

function unexpectedCharacter(text: string, at: number): SyntaxProblem {
  const codePoint = text.codePointAt(at);
  const character = codePoint === undefined ? "" : String.fromCodePoint(codePoint);
  return new SyntaxProblem("JS001", at, `unexpected character ${show(character)}`);
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "0" && character <= "9";
}

function collectDuplicates(node: Node, problems: SyntaxProblem[]): void {
  if (node.kind === "object") {
    const seen = new Set<string>();

    for (const item of node.items) {
      if (item.key !== null) {
        if (seen.has(item.key)) {
          problems.push(
            new SyntaxProblem("JS009", item.keyStart, `duplicate key ${show(item.key)}`),
          );
        } else {
          seen.add(item.key);
        }
      }

      collectDuplicates(item.value, problems);
    }
    return;
  }

  if (node.kind === "array") {
    for (const item of node.items) {
      collectDuplicates(item.value, problems);
    }
  }
}
