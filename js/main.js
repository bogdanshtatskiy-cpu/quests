// js/main.js
import { ItemsDB } from './items.js';
import { Auth } from './auth.js';
import { DB } from './db.js';
import { Editor } from './editor.js';

document.addEventListener('DOMContentLoaded', async () => {
    Auth.init();
    await ItemsDB.load();
    
    // Загружаем данные из облака
    const savedQuests = await DB.loadQuests();
    if (savedQuests && savedQuests.length > 0) {
        // Миграция старых данных (на всякий случай)
        savedQuests.forEach(mod => {
            mod.quests.forEach(q => {
                if (q.req && !q.reqs) q.reqs = [q.req];
                if (!q.reqs) q.reqs = [];
                if (!q.rewards) q.rewards = [];
            });
        });
        Editor.data.mods = savedQuests;
        // АВТОМАТИЧЕСКИ ОТКРЫВАЕМ ПЕРВУЮ ВЕТКУ (Решает проблему "не видно квестов")
        Editor.activeModId = savedQuests[0].id; 
    }
    
    Editor.init();

    // Логика Админ-панели
    document.getElementById('btn-open-admin').addEventListener('click', async () => {
        document.getElementById('admin-modal').classList.remove('hidden');
        
        // Рендер логов
        const logsContainer = document.getElementById('logs-tbody');
        logsContainer.innerHTML = '<tr><td colspan="3">Загрузка...</td></tr>';
        const logs = await DB.getLogs();
        logsContainer.innerHTML = logs.map(l => {
            const time = new Date(l.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second:'2-digit' });
            const date = new Date(l.timestamp).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
            return `<tr><td>${date} ${time}</td><td><b>${l.username}</b></td><td>${l.action}</td></tr>`;
        }).join('');

        renderUsersTable();
    });

    async function renderUsersTable() {
        const usersTbody = document.getElementById('users-tbody');
        usersTbody.innerHTML = '<tr><td colspan="2">Загрузка...</td></tr>';
        const users = await DB.getUsers();
        
        usersTbody.innerHTML = '';
        users.forEach(u => {
            const tr = document.createElement('tr');
            if(u.toLowerCase() === 'desoope') {
                tr.innerHTML = `<td><b style="color:#ffaa00;">${u} (Создатель)</b></td><td>-</td>`;
            } else {
                tr.innerHTML = `<td>${u}</td><td><button class="mc-button danger btn-delete-user" data-user="${u}" style="font-size:12px; padding:2px 5px;">Удалить</button></td>`;
            }
            usersTbody.appendChild(tr);
        });

        document.querySelectorAll('.btn-delete-user').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const login = e.target.getAttribute('data-user');
                if (confirm(`Запретить доступ пользователю ${login}?`)) {
                    await DB.removeUser(login);
                    renderUsersTable(); 
                }
            });
        });
    }

    document.getElementById('btn-close-admin').addEventListener('click', () => {
        document.getElementById('admin-modal').classList.add('hidden');
    });

    document.getElementById('btn-create-user').addEventListener('click', () => {
        const login = document.getElementById('new-user-login').value;
        const pass = document.getElementById('new-user-pass').value;
        if (login && pass) {
            Auth.registerNewUser(login, pass).then(() => {
                document.getElementById('new-user-login').value = '';
                document.getElementById('new-user-pass').value = '';
                renderUsersTable();
            });
        }
    });
});
