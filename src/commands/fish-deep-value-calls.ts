import {Command} from '@oclif/core';
import {startFishingDeepValueCalls} from '../trading/strategies/fish-deep-value-calls';

export default class FishDeepValueCalls extends Command {
  static description = 'Seeks opportunities to sell deep value calls';

  public async run(): Promise<void> {
    startFishingDeepValueCalls();
  }
}
