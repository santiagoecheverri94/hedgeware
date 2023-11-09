import {setTimeout} from 'node:timers/promises';

export interface Throttle {awaiter: Promise<void> | null};

export function getNewThrottle(): Throttle {
  return {awaiter: null};
}

export async function doThrottling(throttle: Throttle, throttleTimeMs: number): Promise<void> {
  while(throttle.awaiter) {
    const myAwaiter = throttle.awaiter;
    await myAwaiter;

    if (myAwaiter === throttle.awaiter) {
      throttle.awaiter = null;
    }
  }
  
  throttle.awaiter = setTimeout(throttleTimeMs);

  return;
}
