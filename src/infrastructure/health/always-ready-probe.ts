import { ReadinessProbe } from '../../application/abstractions/health';

/** Provider InMemory không có phụ thuộc bên ngoài nên luôn sẵn sàng. */
export class AlwaysReadyProbe extends ReadinessProbe {
  check(): Promise<void> {
    return Promise.resolve();
  }
}
