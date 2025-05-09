import {isLiveTrading} from './price-simulator';
import {getCurrentTimeStamp} from './time';

export function log(msg: string): void {
    if (isLiveTrading()) {
        console.log(`${getCurrentTimeStamp()} : ${msg}\n`);
    }
}
