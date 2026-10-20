export class Fail extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Fail";
  }
}
