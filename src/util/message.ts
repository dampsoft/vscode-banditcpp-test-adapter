type MessageType = 'debug'|'info'|'error'|'warning';
const Debug: MessageType = 'debug';
const Info: MessageType = 'info';
const Error: MessageType = 'error';
const Warning: MessageType = 'warning';

export class Message {
  constructor(
      public readonly title: string, public readonly description: string,
      public readonly type: MessageType) {}

  public isDebug() {
    return this.type == Info;
  }

  public isInfo() {
    return this.type == Info;
  }

  public isWarning() {
    return this.type == Warning;
  }

  public isError() {
    return this.type == Error;
  }

  public format(): string {
    return `${this.title}: \n${this.description}`;
  }

  static debug(title: string, description: string) {
    return new Message(title, description, Debug);
  }

  static info(title: string, description: string) {
    return new Message(title, description, Info);
  }

  static warn(title: string, description: string) {
    return new Message(title, description, Warning);
  }

  static error(title: string, description: string) {
    return new Message(title, description, Error);
  }
}
