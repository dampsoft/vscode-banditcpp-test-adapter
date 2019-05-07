
import * as nls from 'vscode-nls';

/**
 * Wrapper for localized messages.
 * It holds the localized message string and replaces its placeholders on each
 * request of get().
 */
export class MessageWrapper {
  private readonly message: string;

  constructor(id: string, fallback: string, count: number = 0) {
    const localize = nls.config({messageFormat: nls.MessageFormat.file})();
    if (count > 0) {
      let placeholders =
          Array.from(Array(count).keys()).map(i => this.getPlaceholder(i));
      this.message = localize(id, fallback, ...placeholders);
    } else {
      this.message = localize(id, fallback);
    }
  }

  public get(...values: (any)[]): string {
    let result = this.message;
    if (values) {
      values.forEach((value: string, index: number, array: any) => {
        result = result.replace(this.getPlaceholder(index), String(value));
      });
    }
    return result;
  }

  private getPlaceholder(index: number): string {
    return `_${index}_`;
  }
}