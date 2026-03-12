import { ItemsDB } from './items.js';
import { Auth } from './auth.js';
import { DB } from './db.js';
import { Editor } from './editor.js';
import { LootEditor } from './loot.js';

document.addEventListener('DOMContentLoaded', () => {
    const loader = document.getElementById('global-loader');
    const indicator = document.getElementById('save-indicator');
    
    // 1. Моментально инициализируем пустой UI
    Auth.init();
    Editor.init();
    LootEditor.init(); 
    
    // 2. Сразу убираем черный экран блокировки
    loader.classList.add('hidden');
    setTimeout(() => loader.style.display = 'none', 500);

    // Показываем фоновый статус загрузки
    indicator.classList.remove('hidden');
    indicator.style.color = "#ffaa00";
    indicator.innerText = "⏳ Синхронизация данных...";

    // 3. ПАРАЛЛЕЛЬНАЯ ЗАГРУЗКА БЕЗ БЛОКИРОВКИ
    const loadItemsTask = ItemsDB.load().then(async () => {
        const customItems = await DB.loadCustomItems();
        ItemsDB.addCustomItems(customItems);
    });

    const loadQuestsTask = DB.loadQuests();

    // 4. Ждем завершения обеих задач
    Promise.all([loadItemsTask, loadQuestsTask]).then(([_, savedQuests]) => {
        if (savedQuests && savedQuests.length > 0) {
            savedQuests.forEach(mod => {
                mod.quests.forEach(q => {
                    if (q.req && !q.reqs) q.reqs = [q.req];
                    if (!q.reqs) q.reqs = [];
                    if (!q.rewards) q.rewards = [];
                });
            });
            Editor.data.mods = savedQuests;
            Editor.activeModId = savedQuests[0].id; 
            
            Editor.renderSidebar();
            Editor.renderCanvas();
            Editor.centerCanvas();
        }
        
        indicator.style.color = "#55ff55";
        indicator.innerText = "✔ Готово!";
        setTimeout(() => indicator.classList.add('hidden'), 2000);
    }).catch(err => {
        console.error("Ошибка при загрузке данных:", err);
        indicator.style.color = "#ff5555";
        indicator.innerText = "❌ Ошибка соединения";
    });

    // ==========================================
    // ЛОГИКА АДМИН-ПАНЕЛИ
    // ==========================================
    document.getElementById('btn-open-admin').addEventListener('click', async () => {
        document.getElementById('admin-modal').classList.remove('hidden');
        const logsContainer = document.getElementById('logs-tbody');
        logsContainer.innerHTML = '<tr><td colspan="3">Загрузка...</td></tr>';
        
        const logs = await DB.getLogs();
        let logsHtml = '';
        logs.forEach(l => {
            let d = new Date(l.timestamp);
            if (isNaN(d.getTime())) d = new Date(); 
            const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second:'2-digit' });
            const date = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
            logsHtml += `<tr><td>${date} ${time}</td><td><b style="color:#55ffff;">${l.username}</b></td><td>${l.action}</td></tr>`;
        });
        logsContainer.innerHTML = logsHtml;
        
        renderUsersTable();
    });

    async function renderUsersTable() {
        const usersTbody = document.getElementById('users-tbody');
        usersTbody.innerHTML = '<tr><td colspan="2">Загрузка...</td></tr>';
        const users = await DB.getUsers();
        let usersHtml = '';
        users.forEach(u => {
            if(u.toLowerCase() === 'desoope') {
                usersHtml += `<tr><td><b style="color:#ffaa00;">${u} (Создатель)</b></td><td>-</td></tr>`;
            } else {
                usersHtml += `<tr><td>${u}</td><td><button class="mc-button danger btn-delete-user" data-user="${u}" style="font-size:12px; padding:2px 5px;">Удалить</button></td></tr>`;
            }
        });
        usersTbody.innerHTML = usersHtml;

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
