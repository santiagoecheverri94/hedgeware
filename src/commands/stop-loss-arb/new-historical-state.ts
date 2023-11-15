import {Args, Command} from '@oclif/core'
import { isHistoricalSnapshot } from '../../utils/price-simulator'
import { createNewHistoricalStockStateForDate, createNewHistoricalStockStatesForDateRange } from '../../trading/strategies/stop-loss-arb/new-state'

export default class StopLossArbNewHistoricalState extends Command {
  static description = 'creates new stock states based on saved historical data'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static flags = {}

  static args = {
    ticker: Args.string({description: 'ticker of stock to make historical state for', required: true}),
    startDate: Args.string({description: 'start date, MM-DD-YYYY, of historical data', required: true}),
    endDate: Args.string({description: 'end date, MM-DD-YYYY, of historical data', required: false}),
  }

  public async run(): Promise<void> {
    const {args} = await this.parse(StopLossArbNewHistoricalState);

    if (!isHistoricalSnapshot()) {
      throw new Error('Cannot create historical state when not in historical snapshot mode.');
    }

    if (args.endDate) {
      await createNewHistoricalStockStatesForDateRange(args.ticker, args.startDate, args.endDate);
    }

    await createNewHistoricalStockStateForDate(args.ticker, args.startDate);

    this.exit();
  }
}
