export interface Edit {
  start: number;
  end: number;
  text: string;
}

export function applyEdits(text: string, edits: Edit[]): string {
  const ordered = [...edits].sort((left, right) => left.start - right.start);
  const parts: string[] = [];
  let cursor = 0;

  for (const edit of ordered) {
    parts.push(text.slice(cursor, edit.start), edit.text);
    cursor = edit.end;
  }

  parts.push(text.slice(cursor));
  return parts.join("");
}
