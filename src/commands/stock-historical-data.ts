import {Args, Command} from '@oclif/core';
import {saveStockHistoricalDataForStockOnDate} from '../historical-data/save-stock-historical-data';

export default class StockHistoricalData extends Command {
  static description = 'saves historical data for a stock from start to end date'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static args = {
    stock: Args.string({description: 'stock to get historical data for', required: true}),
    startDate: Args.string({description: 'start date, MM-DD-YYYY, of historical data', required: true}),
    endDate: Args.string({description: 'end date, MM-DD-YYYY, of historical data', required: false}),
  }

  public async run(): Promise<void> {
    const {args} = await this.parse(StockHistoricalData);

    if (!args.endDate) {
      await saveStockHistoricalDataForStockOnDate(args.stock, args.startDate);
    }

    this.exit();
  }
}
