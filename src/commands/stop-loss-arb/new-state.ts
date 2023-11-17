import {Args, Command} from '@oclif/core';
import {createNewStockStateFromExisting} from '../../trading/strategies/stop-loss-arb/new-state';

export default class StopLossArbNewState extends Command {
  static description = '';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static args = {
    stocksWithPrice: Args.string({description: 'stocks to trade', required: true}),
  }

  public async run(): Promise<void> {
    const {args} = await this.parse(StopLossArbNewState);

    for (const stockWithPrice of args.stocksWithPrice.split(',')) {
      const [stock, price] = stockWithPrice.split(':');
      await createNewStockStateFromExisting(stock, parseFloat(price));
    }

    this.exit();
  }
}
