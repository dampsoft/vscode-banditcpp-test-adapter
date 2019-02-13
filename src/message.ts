export type MessageType = 'info'|'error'|'warning';
export const Info: MessageType = 'info';
export const Error: MessageType = 'error';
export const Warning: MessageType = 'warning';

export class Message {
  constructor(
      public readonly title: string, public readonly description: string,
      public readonly type: MessageType) {}

  public isError() {
    return this.type == Error;
  }

  public isInfo() {
    return this.type == Info;
  }

  public isWarning() {
    return this.type == Warning;
  }

  public format(): string {
    return `${this.title}: \n${this.description}`;
  }

  static error(title: string, description: string) {
    return new Message(title, description, Error);
  }

  static info(title: string, description: string) {
    return new Message(title, description, Info);
  }

  static warn(title: string, description: string) {
    return new Message(title, description, Warning);
  }
}
