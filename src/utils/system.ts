import { getCurrentTimeStamp } from "./time";

export function stopSystem(errorMsg: string): void {
  throw new Error(`${getCurrentTimeStamp()}: ${errorMsg}`);
}
