import {Args, Command, Flags} from '@oclif/core'
import { createNewStockState } from '../../trading/strategies/stop-loss-arb/new-state'

export default class StopLossArbNewState extends Command {
  static description = '';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static flags = {}

  static args = {
    stock: Args.string({description: 'stock to trade', required: true}),
    premiumSold: Args.string({description: 'amount of premium sold', default: '0'}),
  }

  public async run(): Promise<void> {
    const {args} = await this.parse(StopLossArbNewState)

    await createNewStockState(args.stock, parseFloat(args.premiumSold));
    this.exit();
  }
}
