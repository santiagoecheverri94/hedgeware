import {Args, Command, Flags} from '@oclif/core';
import {startStopLossArb} from '../trading/strategies/stop-loss-arb/start';

export default class StopLossArb extends Command {
    static description = 'describe the command here';

    static examples = ['<%= config.bin %> <%= command.id %>'];

    static flags = {
        // flag with a value (-n, --name=VALUE)
        name: Flags.string({char: 'n', description: 'name to print'}),
        // flag with no value (-f, --force)
        force: Flags.boolean({char: 'f'}),
    };

    static args = {
        file: Args.string({description: 'file to read'}),
    };

    public async run(): Promise<void> {
        // const {args, flags} = await this.parse(StopLossArb);

        await startStopLossArb();
        this.exit();
    }
}
