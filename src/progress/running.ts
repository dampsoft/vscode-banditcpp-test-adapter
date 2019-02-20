import {ProgressBox, ProgressStatus} from './progress';

export class RunningProgress extends ProgressStatus {
  constructor(
      steps: number, stepsMax: number, public success: number = 0,
      public failed: number = 0, public skipped: number = 0) {
    super(steps, stepsMax);
  }
}

export function showRunningProgress(cancellationHandler?: () => void) {
  ProgressBox.show<RunningProgress>(
      'running', 'Run tests', (status: RunningProgress) => {
        return `${status.stepsMax} started, ${status.success} passed, ${
            status.failed} failed, ${status.skipped} skipped`;
      }, cancellationHandler);
}

export function updateRunningProgress(status: RunningProgress) {
  ProgressBox.progress('running', status);
}

export function closeRunningProgress() {
  ProgressBox.close('running');
}