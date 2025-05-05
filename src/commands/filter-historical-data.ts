import {Command} from '@oclif/core';

export default class DebugBrokerage extends Command {
    public async run(): Promise<void> {
        const addon = require('bindings')('deephedge');
        addon.JsFilterHistoricalData();
    }
}
