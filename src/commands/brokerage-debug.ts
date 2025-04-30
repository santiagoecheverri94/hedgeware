import {Command} from '@oclif/core';
import {brokerageDebug} from '../trading/brokerage-clients/debug';

export default class DebugBrokerage extends Command {
    public async run(): Promise<void> {
        brokerageDebug();
    }
}
