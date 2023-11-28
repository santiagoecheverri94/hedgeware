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
    static: Flags.boolean({description: 'whether or not to use static intervals', required: false, default: false}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(StopLossArbNewState);

    for (const stockWithPrice of args.stocksWithPrice.split(',')) {
      const [stock, initial] = stockWithPrice.split(':');

      if (!initial) throw new Error(`No price provided for ${stock}`);

      await createNewStockStateFromExisting(stock, Number.parseFloat(initial), !flags.static);
    }

    this.exit();
  }
}
