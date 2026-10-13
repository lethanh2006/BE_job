import { ArgumentError } from '../exceptions';

export class SalaryRange {
  constructor(
    readonly min: number,
    readonly max: number,
  ) {
    if (min < 0) {
      throw new ArgumentError('Mức lương tối thiểu không được âm.');
    }
    if (min > max) {
      throw new ArgumentError(
        'Mức lương tối thiểu không được lớn hơn mức lương tối đa.',
      );
    }
  }

  overlaps(other: SalaryRange): boolean {
    return this.min <= other.max && other.min <= this.max;
  }
}
