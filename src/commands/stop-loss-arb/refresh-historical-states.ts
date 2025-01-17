import {Command, Flags} from '@oclif/core';
import {createNewStockStateFromExisting, refreshHistoricalStates} from '../../trading/strategies/stop-loss-arb/new-state';

export default class StopLossArbRefreshHistoricalStates extends Command {
  static description = '';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static flags = {
    static: Flags.boolean({description: 'whether or not to use static intervals', required: false, default: false}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(StopLossArbRefreshHistoricalStates);

    await refreshHistoricalStates(!flags.static);

    this.exit();
  }
}
