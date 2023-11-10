import {Args, Command, Flags} from '@oclif/core';
import {saveHistoricalData} from '../trading/data/historical-data';

export default class StockHistoricalData extends Command {
  static description = 'saves historical data for a stock from start to end date'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static args = {
    stock: Args.string({description: 'stock to get historical data for', required: true}),
    startDate: Args.string({description: 'start date of historical data', required: true}),
    endDate: Args.string({description: 'end date of historical data', required: true}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(StockHistoricalData);

    saveHistoricalData(args.stock, args.startDate, args.endDate);
  }
}
