export class EventEmitter<T extends Record<string, any[]>> {
    private listeners: { [K in keyof T]?: Function[] } = {};

    on<K extends keyof T>(event: K, fn: (...args: T[K]) => void) {
        this.listeners[event] = [...(this.listeners[event] || []), fn];
        return this;
    }

    emit<K extends keyof T>(event: K, ...args: T[K]) {
        this.listeners[event]?.forEach(fn => fn(...args));
        return true;
    }
}