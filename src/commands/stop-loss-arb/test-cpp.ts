import {Command} from '@oclif/core';

export default class StopLossArbTestCpp extends Command {
    static description = '';

    static examples = ['<%= config.bin %> <%= command.id %>'];

    public async run(): Promise<void> {
        console.log('Testing C++ Node Addon');

        const addon = require('bindings')('deephedge');
        console.log(addon.CppFunction());

        console.log('C++ Node Addon Working Properly.');

        this.exit();
    }
}
