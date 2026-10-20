import { SyntaxProblem } from "./tree";

export function skipTrivia(text: string, pos: number, strict: boolean): number {
  let position = pos;

  while (position < text.length) {
    const character = text[position];

    if (character === " " || character === "\t" || character === "\r" || character === "\n") {
      position += 1;
      continue;
    }

    if (strict || character !== "/") {
      return position;
    }

    if (text[position + 1] === "/") {
      position += 2;
      while (position < text.length && text[position] !== "\n") {
        position += 1;
      }
      continue;
    }

    if (text[position + 1] === "*") {
      const start = position;
      position += 2;

      while (
        position + 1 < text.length &&
        !(text[position] === "*" && text[position + 1] === "/")
      ) {
        position += 1;
      }

      if (position + 1 >= text.length) {
        throw new SyntaxProblem("JS005", start, "unterminated comment");
      }

      position += 2;
      continue;
    }

    return position;
  }

  return position;
}

export function readString(text: string, pos: number): { end: number; value: string } {
  const start = pos;
  let position = pos + 1;
  let value = "";

  while (position < text.length) {
    const character = text[position];

    if (character === '"') {
      return { end: position + 1, value };
    }

    if (character.charCodeAt(0) < 0x20) {
      throw new SyntaxProblem("JS004", position, "control character in string");
    }

    if (character !== "\\") {
      value += character;
      position += 1;
      continue;
    }

    const escapeAt = position;
    position += 1;
    if (position >= text.length) {
      throw new SyntaxProblem("JS006", escapeAt, "invalid escape");
    }

    const escaped = text[position];
    const simpleEscapes: Record<string, string> = {
      '"': '"',
      "\\": "\\",
      "/": "/",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
    };

    if (Object.hasOwn(simpleEscapes, escaped)) {
      value += simpleEscapes[escaped] ?? "";
      position += 1;
      continue;
    }

    if (escaped === "u") {
      const digits = text.slice(position + 1, position + 5);
      if (digits.length !== 4 || !/^[0-9a-fA-F]{4}$/u.test(digits)) {
        throw new SyntaxProblem("JS006", escapeAt, "invalid escape");
      }

      value += String.fromCharCode(Number.parseInt(digits, 16));
      position += 5;
      continue;
    }

    throw new SyntaxProblem("JS006", escapeAt, "invalid escape");
  }

  throw new SyntaxProblem("JS003", start, "unterminated string");
}

export function readNumber(text: string, pos: number): number {
  let position = pos;

  if (text[position] === "-") {
    position += 1;
  }

  if (text[position] === "0") {
    position += 1;
  } else if (isNonzeroDigit(text[position])) {
    position += 1;
    while (isDigit(text[position])) {
      position += 1;
    }
  } else {
    throw invalidNumber(pos);
  }

  if (text[position] === ".") {
    position += 1;
    if (!isDigit(text[position])) {
      throw invalidNumber(pos);
    }
    while (isDigit(text[position])) {
      position += 1;
    }
  }

  if (text[position] === "e" || text[position] === "E") {
    position += 1;
    if (text[position] === "+" || text[position] === "-") {
      position += 1;
    }
    if (!isDigit(text[position])) {
      throw invalidNumber(pos);
    }
    while (isDigit(text[position])) {
      position += 1;
    }
  }

  if (isNumberContinuation(text[position])) {
    throw invalidNumber(pos);
  }

  return position;
}

function invalidNumber(at: number): SyntaxProblem {
  return new SyntaxProblem("JS007", at, "invalid number");
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "0" && character <= "9";
}

function isNonzeroDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "1" && character <= "9";
}

function isNumberContinuation(character: string | undefined): boolean {
  return (
    isDigit(character) ||
    character === "." ||
    character === "e" ||
    character === "E" ||
    character === "+" ||
    character === "-"
  );
}
