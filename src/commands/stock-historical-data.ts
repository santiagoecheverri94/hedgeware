import {Args, Command} from '@oclif/core';
import {
    saveStockHistoricalDataForStockOnDate,
} from '../historical-data/save-stock-historical-data';

export default class StockHistoricalData extends Command {
    static description = 'saves historical data for a stock from start to end date';

    static examples = ['<%= config.bin %> <%= command.id %>'];

    static args = {
        stock: Args.string({
            description: 'stock to get historical data for',
            required: true,
        }),
        date: Args.string({
            description: 'date, YYYY-MM-DD, of historical data',
            required: true,
        }),
    };

    public async run(): Promise<void> {
        const {args} = await this.parse(StockHistoricalData);

        await saveStockHistoricalDataForStockOnDate(args.stock, args.date);

        this.exit();
    }
}
