import moment from 'moment-timezone';
import {promises as fsPromises, writeFileSync} from 'node:fs';
import {setTimeout} from 'node:timers/promises';

export function log(msg: string): void {
  console.log(`\r\n${getCurrentTimeStamp()} : ${msg}\r\n`);
}

export function getCurrentTimeStamp(): string {
  return `${getCurrentTimeInNewYork().format('MM-DD-YYYY')} at ${getCurrentTimeInNewYork().format('hh:mma')} ET`;
}

function getCurrentTimeInNewYork(): moment.Moment {
  const hoursFormat = 'hh:mma:ss';
  const marketTimezone = 'America/New_York';

  return moment(moment().tz(marketTimezone).format(hoursFormat), hoursFormat);
}

export function stopSystem(errorMsg: string): void {
  throw new Error(errorMsg);
}

export async function isMarketOpen(): Promise<boolean> {
  if (process.env.SIMULATE_SNAPSHOT) {
    return true;
  }

  const hoursFormat = 'hh:mma';
  const marketOpens = moment('9:31am', hoursFormat);
  const marketCloses = moment('3:50pm', hoursFormat);
  const currentTimeInNewYork = getCurrentTimeInNewYork();

  if (currentTimeInNewYork.isBefore(marketOpens)) {
    const timeUntilMarketOpens = marketOpens.diff(currentTimeInNewYork);
    await setTimeout(timeUntilMarketOpens);
    return true;
  }

  if (currentTimeInNewYork.isBetween(marketOpens, marketCloses)) {
    return true;
  }

  if (currentTimeInNewYork.isAfter(marketCloses) && !isFriday(currentTimeInNewYork)) {
    const timeUntilMarketOpens = marketOpens.add(getNumDaysUntilMarketOpens(currentTimeInNewYork), 'days').diff(currentTimeInNewYork);
    await setTimeout(timeUntilMarketOpens);
    return true;
  }

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

export async function readJSONFile<T>(filePath: string): Promise<T> {
  const file = await fsPromises.readFile(filePath, 'utf8');
  return JSON.parse(file);
}

export async function asyncWriteJSONFile(filePath: string, jsonString: string): Promise<void> {
  await fsPromises.writeFile(filePath, jsonString);
}

export function syncWriteJSONFile(filePath: string, jsonString: string): void {
  writeFileSync(filePath, jsonString);
}

export function jsonPrettyPrint(obj: unknown): string {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

export async function getFileNamesWithinFolder(folderPath: string): Promise<string[]> {
  const fileNames = await fsPromises.readdir(folderPath);
  return fileNames.filter(fileName => fileName !== 'simulated').map(fileName => fileName.split('.')[0]);
}
