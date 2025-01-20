import {Command, Args} from '@oclif/core';
import {renameHistoricalStates} from '../../trading/strategies/stop-loss-arb/new-state';

export default class StopLossArbRefreshHistoricalStates extends Command {
    static description = '';

    static examples = ['<%= config.bin %> <%= command.id %>'];

    static args = {
        newStock: Args.string({description: 'new stock name', required: true}),
    };

    public async run(): Promise<void> {
        const {args} = await this.parse(StopLossArbRefreshHistoricalStates);

        await renameHistoricalStates(args.newStock);

        this.exit();
    }
}
