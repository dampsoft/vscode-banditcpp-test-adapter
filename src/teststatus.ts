export type TestStatus = 'idle'|'running'|'ok'|'failed'|'skipped';
export const TestStatusIdle: TestStatus = 'idle';
export const TestStatusRunning: TestStatus = 'running';
export const TestStatusPassed: TestStatus = 'ok';
export const TestStatusFailed: TestStatus = 'failed';
export const TestStatusSkipped: TestStatus = 'skipped';
