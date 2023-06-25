import {Command} from '@oclif/core'
import {startLiquidityArb} from '../trading/strategies/liquidity-arb'

export default class LiquidityArb extends Command {
  static description = 'Helps preserve options premium written by arbitraging the liquidity of the underlying equity.'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  // static flags = {
  //   name: Flags.string({char: 'n', description: 'name to print'}),
  //   force: Flags.boolean({char: 'f'}),
  // }

  // static args = {
  //   file: Args.string({description: 'file to read'}),
  // }

  public async run(): Promise<void> {
    // const {args, flags} = await this.parse(LiquidityArb)

    startLiquidityArb()
  }
}
