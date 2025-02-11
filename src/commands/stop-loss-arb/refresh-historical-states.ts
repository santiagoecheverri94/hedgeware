import {Command} from '@oclif/core';
import {
    refreshHistoricalStates,
} from '../../trading/strategies/stop-loss-arb/new-state';

export default class StopLossArbRefreshHistoricalStates extends Command {
    static description = '';

    static examples = ['<%= config.bin %> <%= command.id %>'];

    public async run(): Promise<void> {
        await refreshHistoricalStates();

        this.exit();
    }
}
