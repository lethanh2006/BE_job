export class PagedResult<T> {
  constructor(
    readonly items: T[],
    readonly page: number,
    readonly pageSize: number,
    readonly totalItems: number,
  ) {}

  get totalPages(): number {
    return this.totalItems === 0
      ? 0
      : Math.ceil(this.totalItems / this.pageSize);
  }

  toJSON() {
    return {
      items: this.items,
      page: this.page,
      pageSize: this.pageSize,
      totalItems: this.totalItems,
      totalPages: this.totalPages,
    };
  }
}
