import {Progress, visualizerType} from './core/progress';
import {ProgressStatus} from './core/state';
import {Messages} from './messages';

export class RunningProgress extends ProgressStatus {
  constructor(
      steps: number, stepsMax: number, public passed: number = 0,
      public failed: number = 0, public skipped: number = 0) {
    super(steps, stepsMax);
  }
}

export function showRunningProgress(
    cancellationHandler?: () => void,
    visualization: visualizerType = 'dialogBox') {
  let progressFormatter = (status: RunningProgress) => {
    return Messages.getRunningStatusProgress(
        status.stepsMax, status.passed, status.failed, status.skipped);
  };
  Progress.show(
      'running', Messages.getRunningStatusTitle(), progressFormatter,
      cancellationHandler, visualization);
}

export function updateRunningProgress(status: RunningProgress) {
  Progress.progress('running', status);
}

export function closeRunningProgress() {
  Progress.close('running');
}