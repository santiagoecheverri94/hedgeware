import {Args, Command, Flags} from '@oclif/core';
import {createNewStockStateFromExisting} from '../../trading/strategies/stop-loss-arb/new-state';

export default class StopLossArbNewState extends Command {
  static description = '';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static args = {
    stocksWithPrice: Args.string({description: 'stocks to trade', required: true}),
  }

  static flags = {
    dynamic: Flags.boolean({description: 'whether or not to use dynamic intervals', required: false, default: false}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(StopLossArbNewState);

    for (const stockWithPrice of args.stocksWithPrice.split(',')) {
      const [stock, price] = stockWithPrice.split(':');

      if (!price) throw new Error(`No price provided for ${stock}`);

      await createNewStockStateFromExisting(stock, parseFloat(price), flags.dynamic);
    }

    this.exit();
  }
}
