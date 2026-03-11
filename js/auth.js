import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js';
import { DB } from './db.js';

const app = initializeApp(firebaseConfig);
export const authInst = getAuth(app);

export const Auth = {
    user: null,

    init() {
        const modal = document.getElementById('auth-modal');
        const isGuest = sessionStorage.getItem('quest_guest_mode');
        
        onAuthStateChanged(authInst, async (user) => {
            if (user) {
                const username = user.email.split('@')[0];
                const allowedUsers = await DB.getUsers();

                if (username.toLowerCase() === 'desoope' || allowedUsers.includes(username)) {
                    this.user = { username };
                    modal.classList.add('hidden');
                    this.applyPermissions();
                    if (!sessionStorage.getItem('just_logged_in')) {
                        sessionStorage.setItem('just_logged_in', 'true');
                        DB.logAction('Выполнил вход в редактор');
                    }
                } else {
                    alert('Доступ запрещен. Ваш аккаунт был удален администратором.');
                    signOut(authInst);
                    this.user = null;
                    this.applyPermissions();
                }
            } else {
                this.user = null;
                sessionStorage.removeItem('just_logged_in');
                if (!isGuest) {
                    modal.classList.remove('hidden');
                }
                this.applyPermissions();
            }
        });

        document.getElementById('btn-login').addEventListener('click', async () => {
            const login = document.getElementById('auth-login').value.trim();
            const pass = document.getElementById('auth-pass').value;
            if (!login || !pass) return;

            try {
                await signInWithEmailAndPassword(authInst, `${login}@quest.local`, pass);
            } catch (e) {
                alert('Неверный логин или пароль!');
            }
        });

        document.getElementById('btn-guest').addEventListener('click', () => {
            sessionStorage.setItem('quest_guest_mode', 'true');
            modal.classList.add('hidden');
            this.applyPermissions();
        });

        document.getElementById('btn-logout').addEventListener('click', () => {
            sessionStorage.removeItem('quest_guest_mode'); 
            signOut(authInst);
            window.location.reload();
        });

        document.getElementById('btn-show-login').addEventListener('click', () => {
            modal.classList.remove('hidden');
        });
    },

    async registerNewUser(newLogin, newPass) {
        try {
            const tempApp = initializeApp(firebaseConfig, "TempApp");
            const tempAuth = getAuth(tempApp);
            await createUserWithEmailAndPassword(tempAuth, `${newLogin}@quest.local`, newPass);
            await signOut(tempAuth);
            
            await DB.addUser(newLogin);
            DB.logAction(`Создал нового редактора: ${newLogin}`);
            alert(`Пользователь ${newLogin} успешно создан!`);
        } catch (e) {
            if(e.code === 'auth/email-already-in-use') {
                await DB.addUser(newLogin);
                DB.logAction(`Восстановил доступ пользователю: ${newLogin}`);
                alert(`Пользователь ${newLogin} восстановлен в белом списке!`);
            } else {
                alert('Ошибка создания: ' + e.message);
            }
        }
    },

    applyPermissions() {
        const adminElements = document.querySelectorAll('.admin-only');
        adminElements.forEach(el => el.style.display = this.user ? 'flex' : 'none');
        
        const guestElements = document.querySelectorAll('.guest-only');
        guestElements.forEach(el => el.style.display = this.user ? 'none' : 'inline-block');
        
        const superAdminElements = document.querySelectorAll('.super-admin-only');
        superAdminElements.forEach(el => {
            el.style.display = (this.user && this.user.username.toLowerCase() === 'desoope') ? 'block' : 'none';
        });

        const nameSpan = document.getElementById('current-user-name');
        if(nameSpan) nameSpan.innerText = this.user ? this.user.username : 'Гость';
    }
};
