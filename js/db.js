import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, getDocs, query, orderBy, limit, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';
import { Auth } from './auth.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export const DB = {
    currentWorkspace: 'Основной', // Это значение будет меняться из main.js
    unsubscribeQuests: null,

    _getWorkspaceDocName() {
        // Чтобы не ломать старую базу, "Основной" сохраняем по старому пути
        if (this.currentWorkspace === 'Основной') return "main";
        return `workspace_${this.currentWorkspace}`;
    },

    subscribeToQuests(callback) {
        if (this.unsubscribeQuests) {
            this.unsubscribeQuests();
            this.unsubscribeQuests = null;
        }
        const docName = this._getWorkspaceDocName();
        this.unsubscribeQuests = onSnapshot(doc(db, "quests", docName), (docSnap) => {
            if (docSnap.exists()) {
                callback(docSnap.data().mods || []);
            } else {
                callback([]);
            }
        });
    },

    async saveQuestsSilent(modsData) {
        if (!Auth.user) return;
        try { 
            const docName = this._getWorkspaceDocName();
            await setDoc(doc(db, "quests", docName), { mods: modsData }); 
        } catch (e) {
            console.error("Ошибка автосохранения:", e);
        }
    },

    async loadQuests() {
        try {
            const docName = this._getWorkspaceDocName();
            const docSnap = await getDoc(doc(db, "quests", docName));
            if (docSnap.exists()) return docSnap.data().mods;
            return [];
        } catch (e) { 
            console.error("Ошибка загрузки квестов:", e);
            return []; 
        }
    },

    async deleteWorkspaceQuests(workspaceName) {
        if (!Auth.user) return;
        if (workspaceName === 'Основной') return; // Защита от дурака
        try {
            await deleteDoc(doc(db, "quests", `workspace_${workspaceName}`));
            this.logAction(`Удалил профиль и квесты: ${workspaceName}`);
        } catch (e) {
            console.error("Ошибка удаления профиля:", e);
        }
    },

    async getUsers() {
        try {
            const docSnap = await getDoc(doc(db, "quests", "users_registry"));
            if (docSnap.exists()) return docSnap.data().users || [];
            return [];
        } catch (e) { return []; }
    },

    async addUser(login) {
        let users = await this.getUsers();
        if (!users.includes(login)) {
            users.push(login);
            await setDoc(doc(db, "quests", "users_registry"), { users });
        }
    },

    async removeUser(login) {
        let users = await this.getUsers();
        users = users.filter(u => u !== login);
        await setDoc(doc(db, "quests", "users_registry"), { users });
        this.logAction(`Отозвал доступ у пользователя: ${login}`);
    },

    async logAction(actionDesc) {
        if (!Auth.user) return;
        try {
            await addDoc(collection(db, "logs"), {
                username: Auth.user.username, 
                action: actionDesc, 
                timestamp: new Date().toISOString() 
            });
        } catch (e) {}
    },

    async getLogs() {
        if (!Auth.user) return [];
        try {
            const q = query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(50));
            const querySnapshot = await getDocs(q);
            const logs = [];
            querySnapshot.forEach((doc) => logs.push(doc.data()));
            return logs;
        } catch(e) { return []; }
    },

    async saveCustomItem(itemName, base64Image) {
        if (!Auth.user) return null;
        try {
            const newItem = {
                item_key: `custom_${Date.now()}`,
                name: itemName,
                image: base64Image,
                mod: "Custom (Свои)",
                item_id: 99999
            };
            await addDoc(collection(db, "custom_items"), newItem);
            this.logAction(`Добавил свою иконку: ${itemName}`);
            return newItem;
        } catch (e) {
            console.error("Ошибка сохранения иконки:", e);
            alert("Не удалось сохранить иконку в базу данных.");
            return null;
        }
    },

    async loadCustomItems() {
        try {
            const q = query(collection(db, "custom_items"));
            const snap = await getDocs(q);
            const items = [];
            snap.forEach(doc => items.push(doc.data()));
            return items;
        } catch (e) { return []; }
    },

    async saveVersion(comment, modsData) {
        if (!Auth.user) return;
        try {
            await addDoc(collection(db, "quests_versions"), {
                workspace: this.currentWorkspace,
                comment: comment,
                author: Auth.user.username,
                timestamp: new Date().toISOString(),
                mods: modsData
            });
            this.logAction(`Создал коммит: ${comment}`);
        } catch (e) {
            console.error("Ошибка создания коммита:", e);
        }
    },

    async saveTemplate(name, questData) {
        if (!Auth.user) return;
        try {
            await addDoc(collection(db, "quest_templates"), {
                name: name,
                quest: questData,
                timestamp: new Date().toISOString()
            });
            this.logAction(`Создал шаблон: ${name}`);
        } catch(e) { console.error(e); }
    },

    async getTemplates() {
        try {
            const q = query(collection(db, "quest_templates"), orderBy("timestamp", "desc"));
            const snap = await getDocs(q);
            const templates = [];
            snap.forEach(doc => templates.push({ id: doc.id, ...doc.data() }));
            return templates;
        } catch(e) { return []; }
    },

    async getVersions() {
        if (!Auth.user) return [];
        try {
            const q = query(collection(db, "quests_versions"), orderBy("timestamp", "desc"), limit(100));
            const querySnapshot = await getDocs(q);
            const versions = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.workspace === this.currentWorkspace) {
                    versions.push({ id: doc.id, ...data });
                }
            });
            return versions;
        } catch(e) { 
            console.error(e);
            return []; 
        }
    }
};
