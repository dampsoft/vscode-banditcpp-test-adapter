export type TestStatus = 'idle'|'running'|'ok'|'failed'|'skipped';
export const Idle: TestStatus = 'idle';
export const Running: TestStatus = 'running';
export const Passed: TestStatus = 'ok';
export const Failed: TestStatus = 'failed';
export const Skipped: TestStatus = 'skipped';
