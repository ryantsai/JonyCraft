/**
 * Simple pub/sub event bus for decoupled communication between systems.
 * Enables multiplayer hooks, UI updates, and system-to-system messaging
 * without direct coupling.
 */
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const list = this.listeners.get(event);
    if (!list) return;
    const index = list.indexOf(callback);
    if (index >= 0) list.splice(index, 1);
  }

  emit(event, data) {
    const list = this.listeners.get(event);
    if (!list) return;
    for (const callback of list) {
      callback(data);
    }
  }
}

export const events = new EventBus();
