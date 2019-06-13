import {BanditSpawner} from '../banditcpp/bandit';
import {TestSuiteConfiguration} from '../configuration/configuration';

import {Messages} from './messages';
import {TestSpawnerI} from './testspawner';

export class TestSpawnerFactory {
  public static createSpawner(tsconfig: TestSuiteConfiguration): TestSpawnerI {
    if (tsconfig.framework == 'bandit') {
      return new BanditSpawner(tsconfig);
    }
    throw new Error(Messages
                        .getTestSpawnerFactoryDetectFrameworkError(
                            tsconfig.name, tsconfig.framework)
                        .format());
  }
}