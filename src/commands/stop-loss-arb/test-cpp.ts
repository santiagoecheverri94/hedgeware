import {Command} from '@oclif/core';

export default class StopLossArbTestCpp extends Command {
    static description = '';

    static examples = ['<%= config.bin %> <%= command.id %>'];

    public async run(): Promise<void> {
        console.log('Hello, CPP!');

        this.exit();
    }
}
