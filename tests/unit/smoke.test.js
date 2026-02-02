/**
 * Smoke Test
 * Проверяет, что Jest и моки работают корректно
 */

describe('Jest Setup', () => {
    describe('localStorage mock', () => {
        it('должен быть доступен глобально', () => {
            expect(localStorage).toBeDefined();
            expect(typeof localStorage.getItem).toBe('function');
            expect(typeof localStorage.setItem).toBe('function');
        });

        it('должен сохранять и получать данные', () => {
            localStorage.setItem('test-key', 'test-value');
            expect(localStorage.getItem('test-key')).toBe('test-value');
        });

        it('должен очищаться между тестами', () => {
            // Этот тест проверяет, что данные из предыдущего теста очищены
            expect(localStorage.getItem('test-key')).toBeNull();
        });
    });

    describe('global constants', () => {
        it('STORAGE_KEYS должен быть определён', () => {
            expect(STORAGE_KEYS).toBeDefined();
            expect(STORAGE_KEYS.TABS).toBe('ai-prompts-manager-tabs');
        });

        it('STORAGE_KEYS.workflow должен быть функцией', () => {
            expect(typeof STORAGE_KEYS.workflow).toBe('function');
            expect(STORAGE_KEYS.workflow('my-tab')).toBe('workflow-my-tab');
        });

        it('DEFAULT_TAB должен быть null', () => {
            expect(DEFAULT_TAB).toBeNull();
        });

        it('CURRENT_DATA_VERSION должен быть 4', () => {
            expect(CURRENT_DATA_VERSION).toBe(4);
        });
    });

    describe('AppState mock', () => {
        it('должен быть доступен глобально', () => {
            expect(AppState).toBeDefined();
            expect(AppState.workflow).toBeDefined();
            expect(AppState.app).toBeDefined();
        });

        it('должен иметь корректную структуру workflow', () => {
            expect(AppState.workflow.connections).toEqual([]);
            expect(AppState.workflow.positions).toEqual({});
            expect(AppState.workflow.zoom).toBe(0.6);
        });

        it('resetAppState должен сбрасывать состояние', () => {
            AppState.workflow.connections.push({ from: 'a', to: 'b' });
            expect(AppState.workflow.connections.length).toBe(1);
            
            resetAppState();
            
            expect(AppState.workflow.connections.length).toBe(0);
        });
    });

    describe('mock functions', () => {
        it('showToast должен быть jest.fn()', () => {
            expect(jest.isMockFunction(showToast)).toBe(true);
            
            showToast('test message');
            
            expect(showToast).toHaveBeenCalledWith('test message');
        });
    });
});
