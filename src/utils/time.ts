import moment from 'moment-timezone';
import {setTimeout} from 'node:timers/promises';

import {log} from './log';
import {isLiveTrading} from './price-simulator';

export const MARKET_OPENS = '9:30:10am';
export const MARKET_CLOSES = '3:55pm';

const DATE_FORMAT = 'MM-DD-YYYY';
const TIME_FORMAT = 'hh:mm:ssa';
const MARKET_TIMEZONE = 'America/New_York';

const NANO_SECONDS_FACTOR = 1_000_000_000;

export async function isMarketOpen(stock = ''): Promise<boolean> {
  if (!isLiveTrading()) {
    return true;
  }

  const marketOpens = getMomentForTime(MARKET_OPENS);
  const marketCloses = getMomentForTime(MARKET_CLOSES);
  const currentMomentInNewYork = getCurrentMomentInNewYork();

  if (currentMomentInNewYork.isBefore(marketOpens)) {
    const timeUntilMarketOpens = marketOpens.diff(currentMomentInNewYork);
    log(`Market is not open today yet. Will trade ${stock} in about ${moment.duration(timeUntilMarketOpens).humanize()}.`);
    await setTimeout(timeUntilMarketOpens);
    return true;
  }

  if (currentMomentInNewYork.isBetween(marketOpens, marketCloses)) {
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

function getMomentForTime(time: string): moment.Moment {
  return moment(time, TIME_FORMAT);
}

function getCurrentMomentInNewYork(): moment.Moment {
  return moment(moment().tz(MARKET_TIMEZONE).format(TIME_FORMAT), TIME_FORMAT);
}

export function getCurrentTimeStamp(): string {
  return `${getCurrentMomentInNewYork().format(DATE_FORMAT)} at ${getCurrentMomentInNewYork().format(TIME_FORMAT)} ET`;
}

export function getNanoSecondsEpochTimestampForDateAndTimeInNewYork(date: string, time: string): number {
  const secondsTimestamp = getMomentForDateAndTimeInNewYork(date, time).unix();
  return convertSecondsToNanoSeconds(secondsTimestamp);
}

function getMomentForDateAndTimeInNewYork(date: string, time: string): moment.Moment {
  return moment.tz(`${date} ${time}`, `${DATE_FORMAT} ${TIME_FORMAT}`, MARKET_TIMEZONE);
}

function convertSecondsToNanoSeconds(seconds: number): number {
  return seconds * NANO_SECONDS_FACTOR;
}

export function getTimestampForDateAndTimeInNewYorkFromNanoSecondsEpochTimestamp(nanoSecondsEpochTimestamp: number): string {
  return `${getMomentInNewYorkFromNanoSecondsEpochTimestamp(nanoSecondsEpochTimestamp).format(`${DATE_FORMAT} ${TIME_FORMAT}`)} ET`;
}

function getMomentInNewYorkFromNanoSecondsEpochTimestamp(nanoSecondsEpochTimestamp: number): moment.Moment {
  return moment.unix(convertNanoSecondsToSeconds(nanoSecondsEpochTimestamp)).tz(MARKET_TIMEZONE);
}

function convertNanoSecondsToSeconds(nanoSeconds: number): number {
  return nanoSeconds / NANO_SECONDS_FACTOR;
}

export function getSecondsFromNanoSecondsTimestamp(nanoSecondsEpochTimestamp: number): number {
  return getMomentInNewYorkFromNanoSecondsEpochTimestamp(nanoSecondsEpochTimestamp).seconds();
}
