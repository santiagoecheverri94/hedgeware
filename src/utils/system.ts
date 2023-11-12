import {getCurrentTimeStamp} from './time';
// import {createInterface} from 'readline';

export function stopSystem(errorMsg: string): void {
  throw new Error(`${getCurrentTimeStamp()}: ${errorMsg}`);
}

export function onUserInterrupt(callback: () => void): void {
  // const USER_INTERRUPT = 'SIGINT';

  // if (process.platform === 'win32') {
  //   const terminalInput = createInterface({
  //     input: process.stdin,
  //     output: process.stdout,
  //   });

  //   terminalInput.on(USER_INTERRUPT, () => {
  //     process.emit(USER_INTERRUPT, USER_INTERRUPT);
  //   });
  // }

  // process.on(USER_INTERRUPT, callback);

  if (process.platform === "win32") {
    var rl = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout
    });
  
    rl.on("SIGINT", function () {
      process.emit("SIGINT" as any);
    });
  }
  
  process.on("SIGINT", function () {
    //graceful shutdown
    process.exit();
  });
}
