import moment from 'moment-timezone';
import fs from 'node:fs';

export function log(msg: string): void {
  console.log(`\r\n${moment().format('MM-DD-YYYY')} at ${moment().format('hh:mma')} : ${msg}\r\n`);
}

export function stopSystem(errorMsg: string): void {
  throw new Error(errorMsg);
}

export function isMarketOpen(openingTimeET = '9:35', closingTimeET = '3:30'): boolean {
  const hoursFormat = 'hh:mma';
  const marketTimezone = 'America/New_York';

  const currentTimeInNewYork = moment(moment().tz(marketTimezone).format(hoursFormat), hoursFormat);
  const marketOpens = moment(`${openingTimeET}am`, hoursFormat);
  const marketCloses = moment(`${closingTimeET}pm`, hoursFormat);

  const isMarketHours = currentTimeInNewYork.isBetween(marketOpens, marketCloses);
  return isMarketHours;
}

export function readJSONFile<T>(filePath: string): T {
  const file = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(file);
}
