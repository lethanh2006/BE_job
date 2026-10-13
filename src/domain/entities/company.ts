import { ArgumentError } from '../exceptions';

export class Company {
  readonly name: string;
  readonly location?: string;

  constructor(
    readonly id: number,
    name: string,
    location?: string | null,
  ) {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new ArgumentError('Tên công ty không được để trống.');
    }
    this.name = name.trim();
    this.location = location?.trim();
  }
}
