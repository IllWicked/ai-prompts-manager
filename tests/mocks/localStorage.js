/**
 * Mock для localStorage
 * Используется в тестах для изоляции от реального браузерного хранилища
 */

class LocalStorageMock {
    constructor() {
        this.store = {};
    }

    clear() {
        this.store = {};
    }

    getItem(key) {
        return Object.prototype.hasOwnProperty.call(this.store, key) 
            ? this.store[key] 
            : null;
    }

    setItem(key, value) {
        this.store[key] = String(value);
    }

    removeItem(key) {
        delete this.store[key];
    }

    key(index) {
        const keys = Object.keys(this.store);
        return index >= 0 && index < keys.length ? keys[index] : null;
    }

    get length() {
        return Object.keys(this.store).length;
    }

    /**
     * Симуляция QuotaExceededError
     * Используется для тестирования обработки переполнения хранилища
     */
    simulateQuotaExceeded() {
        const originalSetItem = this.setItem.bind(this);
        this.setItem = (key, value) => {
            const error = new Error('QuotaExceededError');
            error.name = 'QuotaExceededError';
            error.code = 22;
            throw error;
        };
        return () => {
            this.setItem = originalSetItem;
        };
    }
}

// Создаём экземпляр и экспортируем
const localStorageMock = new LocalStorageMock();

module.exports = { LocalStorageMock, localStorageMock };
