import moment from 'moment-timezone';
import {setTimeout} from 'node:timers/promises';

import { log } from './log';

const HOURS_FORMAT = 'hh:mm:ssa';

export async function isMarketOpen(stock=''): Promise<boolean> {
  if (process.env.SIMULATE_SNAPSHOT) {
    return true;
  }

  const marketOpens = moment('9:30:10am', HOURS_FORMAT);
  const marketCloses = moment('3:55pm', HOURS_FORMAT);
  const currentTimeInNewYork = getCurrentTimeInNewYork();

  if (currentTimeInNewYork.isBefore(marketOpens)) {
    const timeUntilMarketOpens = marketOpens.diff(currentTimeInNewYork);
    log(`Market is not open today yet. Will trade ${stock} in about ${moment.duration(timeUntilMarketOpens).humanize()}.`);
    await setTimeout(timeUntilMarketOpens);
    return true;
  }

  if (currentTimeInNewYork.isBetween(marketOpens, marketCloses)) {
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

function getNumDaysUntilMarketOpens(currentTimeInNewYork: moment.Moment): number {
  if (isFriday(currentTimeInNewYork)) {
    return 3;
  }

  return 1;
}

function isFriday(currentTimeInNewYork: moment.Moment): boolean {
  return currentTimeInNewYork.day() === 5;
}

export function getCurrentTimeInNewYork(): moment.Moment {
  const marketTimezone = 'America/New_York';

  return moment(moment().tz(marketTimezone).format(HOURS_FORMAT), HOURS_FORMAT);
}

export function getCurrentTimeStamp(): string {
  return `${getCurrentTimeInNewYork().format('MM-DD-YYYY')} at ${getCurrentTimeInNewYork().format('hh:mm:ssa')} ET`;
}
