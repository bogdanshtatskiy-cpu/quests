// js/main.js
import { Auth } from './auth.js';
import { ItemsDB } from './items.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Инициализируем систему доступов (пароль)
    Auth.init();

    // 2. Загружаем базу предметов
    await ItemsDB.load();

    // 3. Логика поиска в модальном окне
    const searchInput = document.getElementById('item-search');
    const resultsContainer = document.getElementById('search-results');

    searchInput.addEventListener('input', (e) => {
        const results = ItemsDB.search(e.target.value);
        resultsContainer.innerHTML = ''; // Очищаем старые результаты
        
        results.forEach(item => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            // Используем loading="lazy" для оптимизации загрузки картинок
            div.innerHTML = `
                <img src="${ItemsDB.getImageUrl(item.image)}" loading="lazy" width="32" height="32">
                <span>${item.name} <small>(${item.mod})</small></span>
            `;
            
            div.addEventListener('click', () => {
                // При клике на предмет выбираем его
                document.getElementById('custom-item-name').value = item.name; // Подставляем дефолтное название для редактирования
                document.getElementById('selected-item-preview').innerHTML = `
                    <img src="${ItemsDB.getImageUrl(item.image)}" width="64" height="64">
                    <p>Выбран: ${item.name}</p>
                `;
                resultsContainer.innerHTML = ''; // Закрываем поиск
                searchInput.value = '';
            });

            resultsContainer.appendChild(div);
        });
    });
});
