import {TestGroup, TestNodeI} from '../project/test';
import {Message} from '../util/message';

export class ParseResult {
  constructor(public testsuite: TestGroup, public messages: Message[] = []) {}
}

export interface TestSpawnerI {
  dry(): Promise<ParseResult>;
  run(node: TestNodeI): Promise<TestNodeI[]>;
  stop(): void;
}