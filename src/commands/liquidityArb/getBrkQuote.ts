import {Command} from '@oclif/core'
import {IBKRClient} from '../../trading/brokerage-clients/IBKR/IBKRClient'

export default class GetBrkQuote extends Command {
  static description = 'Gets the last price of BRK.B from IBKR'

  static examples = [
    `<%= config.bin %> <%= command.id %>
Last BRK.B price: $338.61
`,
  ]

  static flags = {}

  static args = {}

  async run(): Promise<void> {
    this.log('Initiating connection with IBKR to get last price of BRK.B')
    const client = new IBKRClient(this.exit)

    while (true) {
      await new Promise<void>(resolve => {
        setTimeout(() => {
          resolve()
        }, 100)
      })
    }
  }
}
