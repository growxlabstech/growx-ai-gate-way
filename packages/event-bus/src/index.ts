export interface DomainEvent<T> { id: string; type: string; occurredAt: string; version: number; payload: T; }
export interface EventBus { publish<T>(event: DomainEvent<T>): Promise<void>; subscribe<T>(type: string, handler: (event: DomainEvent<T>) => Promise<void>): Promise<() => Promise<void>>; }
