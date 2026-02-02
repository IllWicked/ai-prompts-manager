/**
 * AI Prompts Manager - Dynamic Input
 * Функции для конструктора полей ввода и динамических модальных окон
 * 
 * @requires tabs.js (getTabBlocks, currentTab, updateBlockInstruction)
 * @requires storage.js (getAllTabs, saveAllTabs)
 * @requires modals.js (closeAllModals)
 * @requires utils.js (escapeHtml)
 * @requires undo.js (captureCurrentTabState, undoStack, redoStack, tabHistories, 
 *                    updateUndoRedoButtons, MAX_HISTORY_SIZE)
 * @requires workflow-render.js (renderWorkflow)
 */

// ═══════════════════════════════════════════════════════════════════════════
// СОСТОЯНИЕ
// ═══════════════════════════════════════════════════════════════════════════

/** @type {number|null} Номер блока для конструктора полей */
let currentConstructorBlockNumber = null;

/** @type {number|null} Номер блока для динамического ввода */
let currentDynamicInputBlock = null;

// ═══════════════════════════════════════════════════════════════════════════
// КОНСТРУКТОР ПОЛЕЙ ВВОДА
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Показать модальное окно конструктора полей
 * @param {number} blockNumber - номер блока
 */
function showInputConstructorModal(blockNumber) {
    currentConstructorBlockNumber = blockNumber;
    closeAllModals();
    
    const blocks = getTabBlocks(currentTab);
    const block = blocks.find(b => b.number === blockNumber);
    const instruction = block?.instruction;
    
    // Выбираем иконку
    const currentIcon = instruction?.icon || 'info';
    document.querySelectorAll('#constructor-icon-selector .icon-option').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.icon === currentIcon);
    });
    
    // Заполняем текст инструкции
    const instructionTextInput = document.getElementById('constructor-instruction-text');
    instructionTextInput.value = instruction?.text || '';
    
    // Заполняем поля конструктора
    const fieldsContainer = document.getElementById('constructor-fields');
    fieldsContainer.innerHTML = '';
    
    if (instruction?.fields && instruction.fields.length > 0) {
        instruction.fields.forEach((field, index) => {
            addConstructorFieldElement(field, index);
        });
    }
    // Если полей нет - контейнер остаётся пустым
    updateAddFieldButton();
    
    document.getElementById('input-constructor-modal').classList.add('open');
    instructionTextInput.focus();
}

/**
 * Скрыть модальное окно конструктора полей
 */
function hideInputConstructorModal() {
    document.getElementById('input-constructor-modal').classList.remove('open');
    currentConstructorBlockNumber = null;
}

/**
 * Добавить элемент поля в конструктор
 * @param {Object} fieldData - данные поля
 * @param {number|null} index - индекс поля (null для нового)
 */
function addConstructorFieldElement(fieldData = {}, index = null) {
    const container = document.getElementById('constructor-fields');
    if (index === null) {
        index = container.children.length;
    }
    
    // Ограничение на 4 поля
    if (index >= 4) {
        return;
    }
    
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'constructor-field bg-gray-50 rounded-lg p-3 border border-gray-200';
    fieldDiv.dataset.fieldIndex = index;
    
    // Первое поле не может быть опциональным
    const optionalCheckbox = index === 0 ? '' : `
            <label class="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" class="field-optional rounded border-gray-300 text-claude-accent " ${fieldData.optional ? 'checked' : ''}>
                <span>Опциональное поле (можно скрыть)</span>
            </label>`;
    
    fieldDiv.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <span class="text-xs font-medium text-gray-500">Поле ${index + 1}</span>
            <button type="button" class="remove-field-btn text-gray-400 hover:text-red-500 transition-colors" title="Удалить поле">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </div>
        <div class="space-y-2">
            <input type="text" class="field-label w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none" 
                   placeholder="Название поля (например: Ключевое слово)" value="${escapeHtml(fieldData.label || '')}">
            <input type="text" class="field-placeholder w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none" 
                   placeholder="example" value="${escapeHtml(fieldData.placeholder || '')}">
            <input type="text" class="field-prefix w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none" 
                   placeholder="Фраза перед заменяемым словом" value="${escapeHtml(fieldData.prefix || '')}">
            ${optionalCheckbox}
        </div>
    `;
    
    // Обработчик удаления поля
    fieldDiv.querySelector('.remove-field-btn').addEventListener('click', () => {
        fieldDiv.remove();
        reindexConstructorFields();
        updateAddFieldButton();
    });
    
    container.appendChild(fieldDiv);
    updateAddFieldButton();
}

/**
 * Обновить видимость кнопки добавления поля
 */
function updateAddFieldButton() {
    const container = document.getElementById('constructor-fields');
    const addBtn = document.getElementById('add-constructor-field-btn');
    if (container.children.length >= 4) {
        addBtn.classList.add('hidden');
    } else {
        addBtn.classList.remove('hidden');
    }
}

/**
 * Переиндексировать поля конструктора после удаления
 */
function reindexConstructorFields() {
    const container = document.getElementById('constructor-fields');
    Array.from(container.children).forEach((field, index) => {
        field.dataset.fieldIndex = index;
        field.querySelector('.text-xs.font-medium').textContent = `Поле ${index + 1}`;
        
        // Первое поле не может быть опциональным
        const optionalCheckbox = field.querySelector('.field-optional');
        const optionalLabel = optionalCheckbox?.closest('label');
        
        if (index === 0 && optionalLabel) {
            optionalLabel.remove();
        } else if (index > 0 && !optionalCheckbox) {
            // Добавляем чекбокс если его нет
            const spaceDiv = field.querySelector('.space-y-2');
            const label = document.createElement('label');
            label.className = 'flex items-center gap-2 text-xs text-gray-600 cursor-pointer';
            label.innerHTML = `
                <input type="checkbox" class="field-optional rounded border-gray-300 text-claude-accent ">
                <span>Опциональное поле (можно скрыть)</span>
            `;
            spaceDiv.appendChild(label);
        }
    });
}

/**
 * Сохранить поля конструктора
 */
function saveConstructorFields() {
    if (!currentConstructorBlockNumber) return;
    
    // Получаем выбранную иконку
    const selectedIcon = document.querySelector('#constructor-icon-selector .icon-option.selected')?.dataset.icon || 'info';
    
    // Получаем текст инструкции
    const instructionText = document.getElementById('constructor-instruction-text').value.trim();
    if (!instructionText) {
        alert('Введите текст сноски');
        return;
    }
    
    const container = document.getElementById('constructor-fields');
    const fields = [];
    
    container.querySelectorAll('.constructor-field').forEach((fieldEl, idx) => {
        const label = fieldEl.querySelector('.field-label').value.trim();
        const placeholder = fieldEl.querySelector('.field-placeholder').value.trim();
        const prefix = fieldEl.querySelector('.field-prefix').value;
        const optionalCheckbox = fieldEl.querySelector('.field-optional');
        // Первое поле (idx=0) не может быть опциональным
        const optional = idx === 0 ? false : (optionalCheckbox?.checked || false);
        
        if (label || prefix) {
            fields.push({ label, placeholder, prefix, optional });
        }
    });
    
    // Определяем тип: если есть поля - input, иначе - info
    const type = fields.length > 0 ? 'input' : 'info';
    
    const updatedInstruction = {
        type: type,
        icon: selectedIcon,
        text: instructionText,
        fields: fields
    };
    
    updateBlockInstruction(currentTab, currentConstructorBlockNumber, updatedInstruction);
    hideInputConstructorModal();
    
    // Обновляем отображение
    if (workflowMode) {
        renderWorkflow();
    } else {
        loadPrompts();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ДИНАМИЧЕСКОЕ МОДАЛЬНОЕ ОКНО (RUNTIME)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Показать модальное окно динамического ввода
 * @param {number} blockNumber - номер блока
 */
function showDynamicInputModal(blockNumber) {
    currentDynamicInputBlock = blockNumber;
    closeAllModals();
    
    // ВАЖНО: Читаем данные НАПРЯМУЮ из localStorage, а не из кэша
    // Это критично для корректной работы после undo/redo
    const tabs = getAllTabs();
    const tabData = tabs[currentTab];
    if (!tabData?.items) return;
    
    const blockIndex = parseInt(blockNumber) - 1;
    const block = tabData.items[blockIndex];
    
    if (!block) return;
    
    const instruction = block?.instruction;
    
    if (!instruction?.fields || instruction.fields.length === 0) {
        // Если полей нет - ничего не делаем
        return;
    }
    
    // Заголовок
    document.getElementById('dynamic-modal-title').textContent = instruction.text || 'Ввод данных';
    
    // Генерируем поля
    const fieldsContainer = document.getElementById('dynamic-modal-fields');
    fieldsContainer.innerHTML = '';
    
    // Получаем текст блока
    // ВАЖНО: Используем block.content напрямую из свежих данных localStorage,
    // а не из DOM (textarea может содержать устаревшие данные после undo)
    const content = block.content || '';
    
    instruction.fields.forEach((field, index) => {
        const fieldWrapper = document.createElement('div');
        fieldWrapper.className = 'dynamic-field';
        fieldWrapper.dataset.fieldIndex = index;
        
        // suffix = prefix следующего поля, или пустая строка (двойной перенос)
        const nextField = instruction.fields[index + 1];
        const suffix = nextField?.prefix || '';
        
        // Извлекаем текущее значение
        let currentValue = '';
        let foundInText = false;
        
        if (field.prefix) {
            // Берём последнее введённое значение из localStorage
            const blockId = block?.id || blockNumber;
            const storageKey = `field-value-${currentTab}-${blockId}-${index}`;
            const savedValue = localStorage.getItem(storageKey);
            const spacer = field.prefix.endsWith(' ') ? '' : ' ';
            const placeholder = field.placeholder || 'example';
            
            // Извлекаем значение между prefix и suffix (или до двойного переноса)
            const extractValueFromText = () => {
                const prefixPos = content.indexOf(field.prefix);
                if (prefixPos === -1) return null;
                
                const afterPrefix = content.substring(prefixPos + field.prefix.length);
                
                // Определяем конец значения: suffix, двойной перенос, или конец текста
                let endPos = afterPrefix.length;
                if (suffix) {
                    const suffixPos = afterPrefix.indexOf(suffix);
                    if (suffixPos !== -1) endPos = suffixPos;
                }
                // Также ограничиваем двойным переносом (новый параграф)
                const doubleNewline = afterPrefix.indexOf('\n\n');
                if (doubleNewline !== -1 && doubleNewline < endPos) {
                    endPos = doubleNewline;
                }
                
                const rawValue = afterPrefix.substring(0, endPos).trim();
                return rawValue || null;
            };
            
            // Проверяем наличие в тексте (поддержка однострочных и многострочных)
            const checkInText = (val) => {
                // Нормализуем значение для сравнения (убираем лишние пробелы/переносы)
                const normalize = (s) => s.replace(/\s+/g, ' ').trim();
                const normalizedVal = normalize(val);
                
                // Проверяем точное совпадение с разными разделителями
                const spacers = [spacer, '\n', '\r\n', ''];
                for (const sp of spacers) {
                    const patterns = [
                        field.prefix + sp + '"' + val + '"',
                        field.prefix + sp + "'" + val + "'",
                        field.prefix + sp + val
                    ];
                    if (patterns.some(p => content.includes(p))) return true;
                }
                
                // Для многострочных: извлекаем значение из текста и сравниваем нормализованно
                const extracted = extractValueFromText();
                if (extracted && normalize(extracted) === normalizedVal) {
                    return true;
                }
                
                return false;
            };
            
            // Также проверяем просто наличие prefix в тексте (для опциональных полей)
            const prefixExistsInText = content.includes(field.prefix);
            
            if (savedValue && checkInText(savedValue)) {
                // Сохранённое значение найдено в тексте
                currentValue = savedValue;
                foundInText = true;
            } else if (checkInText(placeholder)) {
                // Placeholder найден в тексте (первый запуск или после сброса)
                currentValue = placeholder;
                foundInText = true;
                // Сбрасываем localStorage если там было другое значение
                if (savedValue) {
                    localStorage.removeItem(storageKey);
                }
            } else if (prefixExistsInText) {
                // prefix существует в тексте, но точное значение не найдено
                // Извлекаем значение из текста (поддержка многострочных)
                const extracted = extractValueFromText();
                if (extracted) {
                    currentValue = extracted;
                    foundInText = true;
                    // Сохраняем извлечённое значение
                    localStorage.setItem(storageKey, extracted);
                } else if (!field.optional) {
                    // Для обязательных полей показываем placeholder
                    currentValue = placeholder;
                    foundInText = false;
                }
            } else {
                // Ничего не найдено в тексте - поле было удалено (для опциональных)
                // или текст был изменён вручную
                currentValue = placeholder;
                foundInText = false; // Для опциональных полей это значит "скрыто"
                localStorage.removeItem(storageKey);
            }
        }
        
        // Генерируем HTML поля
        if (field.optional) {
            // Опциональное поле с toggle
            const isHidden = !foundInText;
            
            fieldWrapper.innerHTML = `
                <div class="optional-field-toggle ${isHidden ? '' : 'hidden'} mb-2">
                    <button type="button" class="show-optional-field flex items-center gap-1 text-sm text-gray-500 hover:text-claude-accent transition-colors">
                        ${SVG_ICONS.plus}
                        <span>Добавить ${field.label.toLowerCase()}</span>
                    </button>
                </div>
                <div class="optional-field-content ${isHidden ? 'hidden' : ''} mb-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">${escapeHtml(field.label)}</label>
                    <div class="flex gap-2 items-center">
                        <textarea class="dynamic-input flex-1 min-w-0 px-4 border-2 border-gray-200 rounded-lg focus:outline-none text-gray-700 transition-colors resize-none scrollbar-thin leading-5"
                               style="min-height: 42px; padding-top: 9px; padding-bottom: 7px;"
                               rows="1"
                               data-prefix="${escapeHtml(field.prefix || '')}"
                               data-suffix="${escapeHtml(suffix)}"
                               data-optional="true"
                               data-found="${foundInText}"
                               data-original-value="${escapeHtml(currentValue)}"
                               data-field-index="${index}"
                               data-placeholder="${escapeHtml(field.placeholder || 'example')}"
                               placeholder="${escapeHtml(field.placeholder || 'example')}">${escapeHtml(currentValue)}</textarea>
                        <button type="button" class="hide-optional-field flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors" title="Убрать">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
            
            // Обработчики показа/скрытия + авторасширение
            setTimeout(() => {
                const showBtn = fieldWrapper.querySelector('.show-optional-field');
                const hideBtn = fieldWrapper.querySelector('.hide-optional-field');
                const toggle = fieldWrapper.querySelector('.optional-field-toggle');
                const contentEl = fieldWrapper.querySelector('.optional-field-content');
                const textarea = fieldWrapper.querySelector('textarea');
                
                // Авторасширение textarea
                if (textarea) {
                    const autoResize = () => {
                        textarea.style.height = 'auto';
                        const maxHeight = 200;
                        textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
                        textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
                    };
                    textarea.addEventListener('input', autoResize);
                    autoResize();
                }
                
                showBtn?.addEventListener('click', () => {
                    toggle.classList.add('hidden');
                    contentEl.classList.remove('hidden');
                    textarea?.focus();
                });
                
                hideBtn?.addEventListener('click', () => {
                    toggle.classList.remove('hidden');
                    contentEl.classList.add('hidden');
                    if (textarea) textarea.value = '';
                });
            }, 0);
        } else {
            // Обычное обязательное поле — всегда textarea с авторасширением
            fieldWrapper.innerHTML = `
                <div class="mb-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">${escapeHtml(field.label)}</label>
                    <textarea class="dynamic-input w-full px-4 border-2 border-gray-200 rounded-lg focus:outline-none text-gray-700 transition-colors resize-none scrollbar-thin leading-5"
                           style="min-height: 42px; padding-top: 9px; padding-bottom: 7px;"
                           rows="1"
                           data-prefix="${escapeHtml(field.prefix || '')}"
                           data-suffix="${escapeHtml(suffix)}"
                           data-found="${foundInText}"
                           data-original-value="${escapeHtml(currentValue)}"
                           data-field-index="${index}"
                           data-placeholder="${escapeHtml(field.placeholder || 'example')}"
                           placeholder="${escapeHtml(field.placeholder || 'example')}">${escapeHtml(currentValue)}</textarea>
                </div>
            `;
            
            // Авторасширение textarea
            setTimeout(() => {
                const textarea = fieldWrapper.querySelector('textarea');
                if (textarea) {
                    const autoResize = () => {
                        textarea.style.height = 'auto';
                        const maxHeight = 200; // Лимит высоты в пикселях
                        textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
                        textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
                    };
                    textarea.addEventListener('input', autoResize);
                    autoResize(); // Начальная подгонка
                }
            }, 0);
        }
        
        fieldsContainer.appendChild(fieldWrapper);
    });
    
    document.getElementById('dynamic-input-modal').classList.add('open');
    
    // Фокус на первое поле
    setTimeout(() => {
        fieldsContainer.querySelector('.dynamic-input:not([data-optional="true"])')?.focus();
    }, 100);
}

/**
 * Скрыть модальное окно динамического ввода
 */
function hideDynamicInputModal() {
    document.getElementById('dynamic-input-modal').classList.remove('open');
    currentDynamicInputBlock = null;
}

/**
 * Применить изменения из динамического ввода
 */
function applyDynamicInput() {
    if (!currentDynamicInputBlock) return;
    
    // ВАЖНО: Сохраняем состояние ПЕРЕД изменениями (принудительно, без debounce)
    // Это гарантирует что undo вернёт к состоянию до применения модалки
    const stateBefore = captureCurrentTabState();
    // Принудительно добавляем, игнорируя debounce
    if (undoStack.length === 0 || 
        JSON.stringify(undoStack[undoStack.length - 1].tabData) !== JSON.stringify(stateBefore.tabData) ||
        JSON.stringify(undoStack[undoStack.length - 1].fieldValues) !== JSON.stringify(stateBefore.fieldValues)) {
        undoStack.push(stateBefore);
        if (undoStack.length > MAX_HISTORY_SIZE) {
            undoStack.shift();
        }
        redoStack = [];
        // Сохраняем историю для текущей вкладки
        tabHistories[currentTab] = {
            undoStack: [...undoStack],
            redoStack: [...redoStack]
        };
        updateUndoRedoButtons();
    }
    
    // Получаем блок из свежих данных localStorage
    const tabs = getAllTabs();
    const tabData = tabs[currentTab];
    if (!tabData?.items) return;
    
    const blockIndex = parseInt(currentDynamicInputBlock) - 1;
    const block = tabData.items[blockIndex];
    if (!block) return;
    
    // ВАЖНО: Используем content из свежих данных localStorage, не из DOM
    let content = block.content || '';
    let changed = false;
    
    const fieldsContainer = document.getElementById('dynamic-modal-fields');
    
    fieldsContainer.querySelectorAll('.dynamic-input').forEach((input) => {
        const prefix = input.dataset.prefix;
        const originalValue = input.dataset.originalValue || '';
        const fieldIndex = input.dataset.fieldIndex;
        const placeholder = input.dataset.placeholder || input.placeholder || 'example';
        let newValue = input.value.trim();
        if (!newValue) {
            newValue = placeholder;
        }
        const isOptional = input.dataset.optional === 'true';
        const isHidden = input.closest('.optional-field-content')?.classList.contains('hidden');
        
        if (!prefix) return;
        
        // Получаем ID блока для сохранения
        const blockId = block?.id || currentDynamicInputBlock;
        const storageKey = `field-value-${currentTab}-${blockId}-${fieldIndex}`;
        
        if (isOptional && isHidden) {
            // Опциональное поле скрыто — удаляем из текста
            const fieldIdx = parseInt(fieldIndex);
            if (originalValue) {
                const spacer = prefix.endsWith(' ') ? '' : ' ';
                const spacers = [spacer, '\n', '\r\n', ''];
                const patterns = [];
                for (const sp of spacers) {
                    patterns.push(
                        ' ' + prefix + sp + '"' + originalValue + '"',
                        ' ' + prefix + sp + "'" + originalValue + "'",
                        ' ' + prefix + sp + originalValue,
                        '\n' + prefix + sp + '"' + originalValue + '"',
                        '\n' + prefix + sp + "'" + originalValue + "'",
                        '\n' + prefix + sp + originalValue,
                        prefix + sp + '"' + originalValue + '"',
                        prefix + sp + "'" + originalValue + "'",
                        prefix + sp + originalValue
                    );
                }
                for (const pattern of patterns) {
                    const patternIndex = content.indexOf(pattern);
                    if (patternIndex !== -1) {
                        if (block.instruction?.fields?.[fieldIdx]) {
                            block.instruction.fields[fieldIdx].savedPosition = patternIndex;
                        }
                        content = content.substring(0, patternIndex) + content.substring(patternIndex + pattern.length);
                        content = content.replace(/  +/g, ' ');
                        changed = true;
                        break;
                    }
                }
            }
            localStorage.removeItem(storageKey);
        } else if (isOptional && !isHidden && input.dataset.found === 'false') {
            // Опциональное поле было скрыто, теперь показано - ВСТАВЛЯЕМ в текст
            const fieldIdx = parseInt(fieldIndex);
            if (newValue) {
                const savedPosition = block.instruction?.fields?.[fieldIdx]?.savedPosition;
                
                if (savedPosition !== undefined && savedPosition !== null) {
                    const spacer = prefix.endsWith(' ') ? '' : ' ';
                    const insertText = ' ' + prefix + spacer + newValue;
                    let insertPos = savedPosition;
                    if (insertPos > content.length) {
                        insertPos = content.length;
                    }
                    content = content.substring(0, insertPos) + insertText + content.substring(insertPos);
                    changed = true;
                    delete block.instruction.fields[fieldIdx].savedPosition;
                }
                localStorage.setItem(storageKey, newValue);
            }
        } else if (originalValue && newValue !== originalValue) {
            // Значение изменилось — заменяем
            const spacer = prefix.endsWith(' ') ? '' : ' ';
            const spacers = [spacer, '\n', '\r\n', ''];
            const suffix = input.dataset.suffix || '';
            let found = false;
            
            const patterns = [];
            for (const sp of spacers) {
                patterns.push(
                    { search: prefix + sp + '"' + originalValue + '"', replace: prefix + sp + '"' + newValue + '"' },
                    { search: prefix + sp + "'" + originalValue + "'", replace: prefix + sp + "'" + newValue + "'" },
                    { search: prefix + sp + originalValue, replace: prefix + sp + newValue }
                );
            }
            for (const p of patterns) {
                if (content.includes(p.search)) {
                    content = content.replace(p.search, p.replace);
                    changed = true;
                    found = true;
                    break;
                }
            }
            
            // Fallback: замена многострочного значения
            if (!found && content.includes(prefix)) {
                const prefixPos = content.indexOf(prefix);
                const afterPrefix = content.substring(prefixPos + prefix.length);
                
                let endPos = afterPrefix.length;
                if (suffix) {
                    const suffixPos = afterPrefix.indexOf(suffix);
                    if (suffixPos !== -1) endPos = suffixPos;
                }
                const doubleNewline = afterPrefix.indexOf('\n\n');
                if (doubleNewline !== -1 && doubleNewline < endPos) {
                    endPos = doubleNewline;
                }
                
                const oldPart = content.substring(prefixPos, prefixPos + prefix.length + endPos);
                const firstChar = afterPrefix[0];
                const separator = (firstChar === '\n' || firstChar === ' ') ? firstChar : '\n';
                const newPart = prefix + separator + newValue;
                
                content = content.replace(oldPart, newPart);
                changed = true;
            }
            
            localStorage.setItem(storageKey, newValue);
        } else if (!originalValue && newValue) {
            // Первый раз — ищем placeholder в разных форматах
            const placeholderVal = input.dataset.placeholder || input.placeholder || 'example';
            const spacer = prefix.endsWith(' ') ? '' : ' ';
            const spacers = [spacer, '\n', '\r\n', ''];
            const suffix = input.dataset.suffix || '';
            let found = false;
            
            const patterns = [];
            for (const sp of spacers) {
                patterns.push(
                    { search: prefix + sp + '"' + placeholderVal + '"', replace: prefix + sp + '"' + newValue + '"' },
                    { search: prefix + sp + "'" + placeholderVal + "'", replace: prefix + sp + "'" + newValue + "'" },
                    { search: prefix + sp + placeholderVal, replace: prefix + sp + newValue }
                );
            }
            for (const p of patterns) {
                if (content.includes(p.search)) {
                    content = content.replace(p.search, p.replace);
                    changed = true;
                    found = true;
                    break;
                }
            }
            
            // Fallback: замена многострочного placeholder
            if (!found && content.includes(prefix)) {
                const prefixPos = content.indexOf(prefix);
                const afterPrefix = content.substring(prefixPos + prefix.length);
                
                let endPos = afterPrefix.length;
                if (suffix) {
                    const suffixPos = afterPrefix.indexOf(suffix);
                    if (suffixPos !== -1) endPos = suffixPos;
                }
                const doubleNewline = afterPrefix.indexOf('\n\n');
                if (doubleNewline !== -1 && doubleNewline < endPos) {
                    endPos = doubleNewline;
                }
                
                const oldPart = content.substring(prefixPos, prefixPos + prefix.length + endPos);
                const firstChar = afterPrefix[0];
                const separator = (firstChar === '\n' || firstChar === ' ') ? firstChar : '\n';
                const newPart = prefix + separator + newValue;
                
                content = content.replace(oldPart, newPart);
                changed = true;
            }
            
            localStorage.setItem(storageKey, newValue);
        } else {
            // Значение не изменилось — просто сохраняем
            localStorage.setItem(storageKey, newValue);
        }
    });
    
    if (changed) {
        // Обновляем данные в tabs напрямую
        block.content = content;
        saveAllTabs(tabs);
        
        // Перерендериваем workflow чтобы обновить превью
        renderWorkflow();
        
        // Принудительно сохраняем состояние ПОСЛЕ изменений в undo стек
        setTimeout(() => {
            const stateAfter = captureCurrentTabState();
            if (undoStack.length === 0 || JSON.stringify(undoStack[undoStack.length - 1]) !== JSON.stringify(stateAfter)) {
                undoStack.push(stateAfter);
                if (undoStack.length > MAX_HISTORY_SIZE) {
                    undoStack.shift();
                }
                tabHistories[currentTab] = {
                    undoStack: [...undoStack],
                    redoStack: [...redoStack]
                };
                updateUndoRedoButtons();
            }
        }, 50);
    }
    
    hideDynamicInputModal();
}

// ═══════════════════════════════════════════════════════════════════════════
// ЭКСПОРТ
// ═══════════════════════════════════════════════════════════════════════════

window.showInputConstructorModal = showInputConstructorModal;
window.hideInputConstructorModal = hideInputConstructorModal;
window.addConstructorFieldElement = addConstructorFieldElement;
window.updateAddFieldButton = updateAddFieldButton;
window.reindexConstructorFields = reindexConstructorFields;
window.saveConstructorFields = saveConstructorFields;
window.showDynamicInputModal = showDynamicInputModal;
window.hideDynamicInputModal = hideDynamicInputModal;
window.applyDynamicInput = applyDynamicInput;
