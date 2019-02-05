export type MessageType = 'info'|'error';
export const Info: MessageType = 'info';
export const Error: MessageType = 'error';

export class Message {
  constructor(public readonly text: string, public readonly type: MessageType) {
  }

  public isError() {
    return this.type == Error;
  }

  public isInfo() {
    return this.type == Info;
  }

  static error(message: string) {
    return new Message(message, Error);
  }

  static info(message: string) {
    return new Message(message, Info);
  }
}