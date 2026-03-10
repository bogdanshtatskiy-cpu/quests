// js/main.js
import { Auth } from './auth.js';
import { ItemsDB } from './items.js';
import { Editor } from './editor.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Инициализируем систему доступов
    Auth.init();

    // 2. Загружаем базу предметов из JSON
    await ItemsDB.load();

    // 3. Запускаем движок редактора
    Editor.init();
});
