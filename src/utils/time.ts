import moment from 'moment-timezone';
import {setTimeout} from 'node:timers/promises';

import {log} from './log';
import {isLiveTrading} from './price-simulator';

const kTradingStartTime = '10:57:00am';
export const kTradingEndTime = '3:45:00pm';
const kMarketCloseTime = '4:00:00pm';

const DATE_FORMAT = 'YYYY-MM-DD';
const TIME_FORMAT = 'hh:mm:ssa';
const MARKET_TIMEZONE = 'America/New_York';

export async function isTimeToTrade(stock = ''): Promise<boolean> {
    const startTime = getMomentForTime(kTradingStartTime);
    const marketCloses = getMomentForTime(kMarketCloseTime);
    const currentMomentInNewYork = getCurrentMomentInNewYork();

    if (currentMomentInNewYork.isBefore(startTime)) {
        const timeUntilMarketOpens = startTime.diff(currentMomentInNewYork);
        log(
            `Not yet time to trade. Will trade ${stock} in about ${moment
                .duration(timeUntilMarketOpens)
                .humanize()}.`,
        );
        await setTimeout(timeUntilMarketOpens);
        return true;
    }

    if (currentMomentInNewYork.isBetween(startTime, marketCloses)) {
        return true;
    }

    // if (currentTimeInNewYork.isAfter(marketCloses) && !isFriday(currentTimeInNewYork)) {
    //   const timeUntilMarketOpens = marketOpens.add(getNumDaysUntilMarketOpens(currentTimeInNewYork), 'days').diff(currentTimeInNewYork);
    //   await setTimeout(timeUntilMarketOpens);
    //   return true;
    // }

    log(`Market is closed for today. May trade ${stock} next trading day.`);

    return false;
}

export function getMomentForTime(time: string): moment.Moment {
    return moment(time, TIME_FORMAT);
}

export function getCurrentMomentInNewYork(): moment.Moment {
    return moment(moment().tz(MARKET_TIMEZONE).format(TIME_FORMAT), TIME_FORMAT);
}

export function getCurrentTimeStamp(): string {
    return `${getCurrentMomentInNewYork().format(
        DATE_FORMAT,
    )} at ${getCurrentMomentInNewYork().format(TIME_FORMAT)} ET`;
}
