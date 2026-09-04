export class ForgePartnerError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "ForgePartnerError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ForgeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForgeConfigError";
  }
}
