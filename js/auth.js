// js/auth.js
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
        
        onAuthStateChanged(authInst, (user) => {
            if (user) {
                this.user = { username: user.email.split('@')[0] };
                modal.classList.add('hidden');
                this.applyPermissions();
                if (!sessionStorage.getItem('just_logged_in')) {
                    sessionStorage.setItem('just_logged_in', 'true');
                    DB.logAction('Выполнил вход в систему');
                }
            } else {
                this.user = null;
                sessionStorage.removeItem('just_logged_in');
                this.applyPermissions();
            }
        });

        document.getElementById('btn-login').addEventListener('click', async () => {
            const login = document.getElementById('auth-login').value.trim();
            const pass = document.getElementById('auth-pass').value;
            if (!login || !pass) return;

            try {
                const email = `${login}@quest.local`;
                await signInWithEmailAndPassword(authInst, email, pass);
            } catch (e) {
                alert('Неверный логин или пароль!');
            }
        });

        document.getElementById('btn-guest').addEventListener('click', () => {
            modal.classList.add('hidden');
            this.applyPermissions();
        });

        document.getElementById('btn-logout').addEventListener('click', () => {
            signOut(authInst);
            window.location.reload();
        });
    },

    async registerNewUser(newLogin, newPass) {
        try {
            const tempApp = initializeApp(firebaseConfig, "TempApp");
            const tempAuth = getAuth(tempApp);
            await createUserWithEmailAndPassword(tempAuth, `${newLogin}@quest.local`, newPass);
            await signOut(tempAuth);
            
            DB.logAction(`Создал нового пользователя: ${newLogin}`);
            alert(`Пользователь ${newLogin} успешно создан!`);
        } catch (e) {
            alert('Ошибка создания: ' + e.message);
        }
    },

    applyPermissions() {
        const adminElements = document.querySelectorAll('.admin-only');
        adminElements.forEach(el => el.style.display = this.user ? 'flex' : 'none');
        
        const saveBtn = document.getElementById('btn-save-cloud');
        if(saveBtn) saveBtn.style.display = this.user ? 'block' : 'none';
        
        const superAdminElements = document.querySelectorAll('.super-admin-only');
        superAdminElements.forEach(el => {
            el.style.display = (this.user && this.user.username.toLowerCase() === 'desoope') ? 'block' : 'none';
        });

        const nameSpan = document.getElementById('current-user-name');
        if(nameSpan) nameSpan.innerText = this.user ? this.user.username : 'Гость';
    }
};
