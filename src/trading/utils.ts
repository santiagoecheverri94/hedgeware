import moment from 'moment';

export function log(msg: string): void {
  console.log(`\r\n${moment().format('MM-DD-YYYY')} at ${moment().format('hh:mma')} : ${msg}\r\n`);
}

export function stopSystem(errorMsg: string): void {
  throw new Error(errorMsg);
}
