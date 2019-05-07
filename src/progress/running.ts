import {Messages} from './messages';
import {ProgressBox, ProgressStatus} from './progress';

export class RunningProgress extends ProgressStatus {
  constructor(
      steps: number, stepsMax: number, public passed: number = 0,
      public failed: number = 0, public skipped: number = 0) {
    super(steps, stepsMax);
  }
}

export function showRunningProgress(cancellationHandler?: () => void) {
  ProgressBox.show<RunningProgress>(
      'running',
      Messages.getRunningStatusTitle(), (status: RunningProgress) => {
        return Messages.getRunningStatusProgress(
            status.stepsMax, status.passed, status.failed, status.skipped);
      }, cancellationHandler);
}

export function updateRunningProgress(status: RunningProgress) {
  ProgressBox.progress('running', status);
}

export function closeRunningProgress() {
  ProgressBox.close('running');
}