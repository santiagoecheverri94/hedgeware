import moment from 'moment-timezone';
import {promises as fsPromises} from 'node:fs';

export function log(msg: string): void {
  console.log(`\r\n${getCurrentTimeStamp()} : ${msg}\r\n`);
}

export function getCurrentTimeStamp(): string {
  return `${getCurrentTimeInNewYork().format('MM-DD-YYYY')} at ${getCurrentTimeInNewYork().format('hh:mma ET')}`;
}

function getCurrentTimeInNewYork(): moment.Moment {
  const hoursFormat = 'hh:mma';
  const marketTimezone = 'America/New_York';

  return moment(moment().tz(marketTimezone).format(hoursFormat), hoursFormat);
}

export function stopSystem(errorMsg: string): void {
  throw new Error(errorMsg);
}

export function isMarketOpen(openingTimeET = '9:40', closingTimeET = '3:50'): boolean {
  if (process.env.SIMULATE_SNAPSHOT) {
    return true;
  }

  const hoursFormat = 'hh:mma';
  const marketTimezone = 'America/New_York';

  const currentTimeInNewYork = getCurrentTimeInNewYork();
  const marketOpens = moment(`${openingTimeET}am`, hoursFormat);
  const marketCloses = moment(`${closingTimeET}pm`, hoursFormat);

  const isMarketHours = currentTimeInNewYork.isBetween(marketOpens, marketCloses);
  return isMarketHours;
}

export async function readJSONFile<T>(filePath: string): Promise<T> {
  const file = await fsPromises.readFile(filePath, 'utf8');
  return JSON.parse(file);
}

export async function writeJSONFile(filePath: string, jsonString: string): Promise<void> {
  await fsPromises.writeFile(filePath, jsonString);
}

export function jsonPrettyPrint(obj: unknown): string {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

export async function getFileNamesWithinFolder(folderPath: string): Promise<string[]> {
  const fileNames = await fsPromises.readdir(folderPath);
  return fileNames.filter(fileName => fileName !== 'simulated').map(fileName => fileName.split('.')[0]);
}
