
/**
 * Wrapper for localized messages.
 * It holds the localized message string and replaces its placeholders on each
 * request of get().
 */
export class MessageWrapper {
  constructor(
    private readonly message: string,
    private readonly placeholders: string[] = []) { }

  public get(...values: (any)[]): string {
    let result = this.message;
    if (values && values.length == this.placeholders.length) {
      values.forEach((value: string, index: number, array: any) => {
        result = result.replace(this.placeholders[index], String(value));
      });
    }
    return result;
  }
}