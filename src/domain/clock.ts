export abstract class Clock {
  abstract get utcNow(): Date;
}

export class SystemClock extends Clock {
  get utcNow(): Date {
    return new Date();
  }
}
