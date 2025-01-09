import {Command, Flags} from '@oclif/core';
import {createNewStockStateFromExisting, refreshHistoricalStates} from '../../trading/strategies/stop-loss-arb/new-state';

export default class StopLossArbRefreshHistoricalStates extends Command {
  static description = '';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  public async run(): Promise<void> {
    await refreshHistoricalStates();

    this.exit();
  }
}
