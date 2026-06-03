/**
 * A strongly-typed generic event emitter base class.
 *
 * @export
 * @class EventEmitter
 * @template {Record<string, any[]>} T A map of event names to their payload tuple types.
 */
export class EventEmitter<T extends Record<string, any[]>> {
    private listeners: { [K in keyof T]?: Function[] } = {};

    /**
     * Subscribes a callback function to a specific event.
     *
     * @template {keyof T} K 
     * @param {K} event The name of the event to listen for.
     * @param {(...args: T[K]) => void} fn The callback to execute when the event fires.
     * @returns {this} The emitter instance for chaining.
     */
    on<K extends keyof T>(event: K, fn: (...args: T[K]) => void): this {
        this.listeners[event] = [...(this.listeners[event] || []), fn];
        return this;
    }

    /**
     * Fires an event, triggering all subscribed listeners with the provided arguments.
     *
     * @template {keyof T} K 
     * @param {K} event The name of the event to trigger.
     * @param {...T[K]} args The typed arguments to pass to the listeners.
     * @returns {boolean} True if the event was successfully dispatched.
     */
    emit<K extends keyof T>(event: K, ...args: T[K]): boolean {
        this.listeners[event]?.forEach(fn => fn(...args));
        return true;
    }
}