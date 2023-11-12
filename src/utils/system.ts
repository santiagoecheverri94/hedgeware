import {getCurrentTimeStamp} from './time';
// import {createInterface} from 'readline';

export function stopSystem(errorMsg: string): void {
  throw new Error(`${getCurrentTimeStamp()}: ${errorMsg}`);
}

export function onUserInterrupt(callback: () => void): void {
  // process.on('SIGINT', function() {
  //   process.exit(0);
  // });
  
  // process.on('SIGTERM', function() {
  //   process.exit(0);
  // });
  
  // process.on('exit', function() {
  //   process.stdout.write("Bye");
  // });
}
