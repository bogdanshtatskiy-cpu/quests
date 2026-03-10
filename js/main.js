// js/main.js
import { ItemsDB } from './items.js';
import { Auth } from './auth.js';
import { DB } from './db.js';
import { Editor } from './editor.js';

document.addEventListener('DOMContentLoaded', async () => {
    Auth.init();
    await ItemsDB.load();
    const savedQuests = await DB.loadQuests();
    if (savedQuests && savedQuests.length > 0) {
        Editor.data.mods = savedQuests;
    }
    Editor.init();

    document.getElementById('btn-save-cloud').addEventListener('click', () => {
        DB.saveQuests(Editor.data.mods);
    });

    document.getElementById('btn-open-admin').addEventListener('click', async () => {
        document.getElementById('admin-modal').classList.remove('hidden');
        const logsContainer = document.getElementById('logs-container');
        logsContainer.innerHTML = 'Загрузка логов...';
        const logs = await DB.getLogs();
        logsContainer.innerHTML = logs.map(l => `[${new Date(l.timestamp).toLocaleString('ru-RU')}] <b>${l.username}</b>: ${l.action}`).join('<br>');
    });

    document.getElementById('btn-close-admin').addEventListener('click', () => {
        document.getElementById('admin-modal').classList.add('hidden');
    });

    document.getElementById('btn-create-user').addEventListener('click', () => {
        const login = document.getElementById('new-user-login').value;
        const pass = document.getElementById('new-user-pass').value;
        if (login && pass) {
            Auth.registerNewUser(login, pass);
            document.getElementById('new-user-login').value = '';
            document.getElementById('new-user-pass').value = '';
        }
    });
});
