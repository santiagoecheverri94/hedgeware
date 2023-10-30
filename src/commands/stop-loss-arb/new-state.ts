import {Args, Command, Flags} from '@oclif/core'
import { createNewStockState } from '../../trading/strategies/stop-loss-arb/new-state'

export default class StopLossArbNewState extends Command {
  static description = '';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static flags = {
    stock: Flags.string({char: 's', description: 'stock to trade', required: true}),
    brokerageId: Flags.string({char: 'b', description: 'stock brokerage id', required: true}),
    initialPrice: Flags.string({char: 'p', description: 'initial price of stock', required: true}),
  }

  static args = {}

  public async run(): Promise<void> {
    const {flags} = await this.parse(StopLossArbNewState)

    createNewStockState({
      stock: flags.stock,
      brokerageId: flags.brokerageId,
      brokerageTradingCostPerShare: 0.005,
      sharesPerInterval: 10,
      numContracts: 1,
      targetPosition: 10,
      initialPrice: parseFloat(flags.initialPrice),
      intervalProfit: 0.02,
      spaceBetweenIntervals: 0.07,
    });
  }
}
