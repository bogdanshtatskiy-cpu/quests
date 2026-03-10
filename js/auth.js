// js/auth.js
export const Auth = {
    key: localStorage.getItem('quest_admin_key') || null,
    isAdmin: false,

    init() {
        const modal = document.getElementById('auth-modal');
        
        if (this.key) {
            this.login(this.key);
            modal.style.display = 'none';
        }

        document.getElementById('btn-login').addEventListener('click', () => {
            const inputKey = document.getElementById('auth-key').value;
            if (inputKey) {
                this.login(inputKey);
                modal.style.display = 'none';
            }
        });

        document.getElementById('btn-guest').addEventListener('click', () => {
            modal.style.display = 'none';
            this.applyPermissions(); // Оставит кнопки скрытыми
        });
    },

    login(token) {
        this.key = token;
        this.isAdmin = true;
        localStorage.setItem('quest_admin_key', token);
        this.applyPermissions();
    },

    applyPermissions() {
        // Показываем кнопки редактирования только если админ
        const adminElements = document.querySelectorAll('.admin-only');
        adminElements.forEach(el => {
            el.style.display = this.isAdmin ? 'block' : 'none';
        });
    }
};
