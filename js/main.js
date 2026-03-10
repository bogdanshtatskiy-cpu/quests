// js/main.js
import { ItemsDB } from './items.js';
import { Editor } from './editor.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Ждем загрузки базы данных
    await ItemsDB.load();
    
    // Запускаем движок редактора квестов
    Editor.init();
});
