import {EnvProperty} from '../configuration/environment';
import {TestGroup, TestNodeI} from '../project/test';
import {Message} from '../util/message';

export class ParseResult {
  constructor(public testsuite: TestGroup, public messages: Message[] = []) {}
}

export interface TestSpawnerI {
  dry(): Promise<ParseResult>;
  run(node: TestNodeI, spawnEnv?: EnvProperty): Promise<TestNodeI[]>;
  stop(): void;
}