import {Args, Command} from '@oclif/core';
import {createNewStockState} from '../../trading/strategies/stop-loss-arb/new-state';

export default class StopLossArbNewState extends Command {
  static description = '';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static flags = {}

  static args = {
    stock: Args.string({description: 'stock to trade', required: true}),
  }

  public async run(): Promise<void> {
    const {args} = await this.parse(StopLossArbNewState);

    await createNewStockState(args.stock);
    this.exit();
  }
}
