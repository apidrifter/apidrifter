/** Wrong flags or arguments. Exit code 2. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/** A file, URL or document the user gave could not be used. Exit code 2. */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

export const EXIT_OK = 0;
export const EXIT_THRESHOLD = 1;
export const EXIT_USAGE = 2;
export const EXIT_ENGINE = 3;
