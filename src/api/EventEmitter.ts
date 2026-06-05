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
     * Unsubscribes a callback function from a specific event.
     *
     * @template {keyof T} K 
     * @param {K} event The name of the event unsubscribe from.
     * @param {(...args: T[K]) => void} fn The callback to remove from listeners. 
     * @returns {this} The emitter instance for chaining.
     */
    off<K extends keyof T>(event: K, fn: (...args: T[K]) => void): this {
        const eventListeners = this.listeners[event]
        if (eventListeners){
            this.listeners[event] = eventListeners.filter(f => f !== fn)
        }
        return this
    }

    /**
     * Fires an event, triggering all subscribed listeners with the provided arguments.
     *
     * @template {keyof T} K 
     * @param {K} event The name of the event to listen for.
     * @param {...T[K]} args The typed arguments to pass to the listeners.
     * @returns {boolean} Always returns true if listeners were called.
     */
    emit<K extends keyof T>(event: K, ...args: T[K]): true {
        this.listeners[event]?.forEach(fn => fn(...args));
        return true;
    }

    /**
     * Subscribes a callback that will be executed only once,
     * then automatically unsubscribed after execution.
     *
     * @template {keyof T} K 
     * @param {K} event The name of the event to listen for.
     * @param {(...args: T[K]) => void} fn The callback to execute on first event trigger.
     * @returns {this} The emitter instance for chaining.
     */
    once<K extends keyof T>(event: K, fn: (...args: T[K]) => void): this {
        const wrapper = (...args: T[K]) => {
            fn(...args)
            this.off(event, wrapper)
        }
        this.on(event, wrapper)
        return this
    }
    
    removeAllListeners(): void {
        this.listeners = {}
    }
}