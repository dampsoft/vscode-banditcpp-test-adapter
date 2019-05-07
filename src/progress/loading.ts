import {Messages} from './messages';
import {ProgressBox, ProgressStatus} from './progress';

export class LoadingProgress extends ProgressStatus {
  constructor(
      steps: number, stepsMax: number, public tests: number = 0,
      public warnings: number = 0, public errors: number = 0) {
    super(steps, stepsMax);
  }
}

export function showLoadingProgress(cancellationHandler?: () => void) {
  ProgressBox.show<LoadingProgress>(
      'loading',
      Messages.getLoadingStatusTitle(), (status: LoadingProgress) => {
        return Messages.getLoadingStatusProgress(
            status.tests, status.errors, status.warnings);
      }, cancellationHandler);
}

export function updateLoadingProgress(status: LoadingProgress) {
  ProgressBox.progress('loading', status);
}

export function closeLoadingProgress() {
  ProgressBox.close('loading');
}