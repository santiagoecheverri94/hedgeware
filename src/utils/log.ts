import {getCurrentTimeStamp} from './time';

export function log(msg: string): void {
  console.log(`\r\n${getCurrentTimeStamp()} : ${msg}\r\n`);
}
