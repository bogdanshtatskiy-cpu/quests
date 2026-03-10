// js/editor.js
import { ItemsDB } from './items.js';

export const Editor = {
    // Здесь будет храниться весь JSON проекта
    data: {
        mods: [] // Структура: { id: '...', name: '...', icon: '...', quests: [] }
    },
    activeModId: null, // ID текущей открытой вкладки

    init() {
        this.bindModModalEvents();
        this.renderSidebar();
    },

    bindModModalEvents() {
        const modal = document.getElementById('add-mod-modal');
        const btnAdd = document.getElementById('btn-add-mod');
        const btnClose = document.getElementById('btn-close-mod');
        const btnSave = document.getElementById('btn-save-mod');
        
        const searchInput = document.getElementById('mod-icon-search');
        const resultsContainer = document.getElementById('mod-icon-results');
        const previewContainer = document.getElementById('mod-icon-preview');

        let selectedIconPath = null;

        // Открыть окно
        btnAdd.addEventListener('click', () => {
            modal.classList.remove('hidden');
        });

        // Закрыть окно
        btnClose.addEventListener('click', () => {
            modal.classList.add('hidden');
        });

        // Поиск иконки для мода
        searchInput.addEventListener('input', (e) => {
            const results = ItemsDB.search(e.target.value);
            resultsContainer.innerHTML = ''; 
            
            results.forEach(item => {
                const div = document.createElement('div');
                div.className = 'search-result-item';
                div.innerHTML = `
                    <img src="${ItemsDB.getImageUrl(item.image)}" loading="lazy" width="32" height="32">
                    <span>${item.name}</span>
                `;
                
                div.addEventListener('click', () => {
                    selectedIconPath = item.image;
                    previewContainer.innerHTML = `
                        <img src="${ItemsDB.getImageUrl(item.image)}" width="48" height="48" style="image-rendering: pixelated;">
                        <span style="color: #43b581; margin-left: 10px;">Иконка выбрана!</span>
                    `;
                    resultsContainer.innerHTML = ''; // Скрываем результаты
                    searchInput.value = '';
                });

                resultsContainer.appendChild(div);
            });
        });

        // Сохранение новой вкладки
        btnSave.addEventListener('click', () => {
            const name = document.getElementById('new-mod-name').value.trim();
            
            if (!name || !selectedIconPath) {
                alert('Пожалуйста, введите название и выберите иконку!');
                return;
            }

            // Создаем уникальный ID для мода
            const modId = 'mod_' + Date.now();
            
            this.data.mods.push({
                id: modId,
                name: name,
                icon: selectedIconPath,
                quests: [] // Сюда позже будем пушить узлы квестов
            });

            // Делаем новый мод активным сразу
            this.activeModId = modId;
            
            // Очищаем форму и закрываем окно
            document.getElementById('new-mod-name').value = '';
            previewContainer.innerHTML = '';
            selectedIconPath = null;
            modal.classList.add('hidden');

            // Обновляем интерфейс
            this.renderSidebar();
        });
    },

    renderSidebar() {
        const list = document.getElementById('mod-list');
        list.innerHTML = '';

        this.data.mods.forEach(mod => {
            const li = document.createElement('li');
            li.className = 'mod-item';
            // Если это активный мод, добавляем класс active для подсветки
            if (this.activeModId === mod.id) li.classList.add('active');

            li.innerHTML = `
                <img src="${ItemsDB.getImageUrl(mod.icon)}" width="24" height="24" style="vertical-align: middle; margin-right: 10px; image-rendering: pixelated;">
                <span>${mod.name}</span>
            `;

            // Переключение между модами по клику
            li.addEventListener('click', () => {
                this.activeModId = mod.id;
                this.renderSidebar(); // Перерисовываем меню, чтобы сдвинуть подсветку
                this.renderCanvas(); // Рендерим квесты этого мода (сделаем позже)
            });

            list.appendChild(li);
        });
    },

    renderCanvas() {
        const canvas = document.getElementById('quest-canvas');
        canvas.innerHTML = ''; // Очищаем холст при переключении вкладки
        // Позже здесь будет логика отрисовки иконок квестов
        console.log('Открыта вкладка:', this.activeModId);
    }
};
