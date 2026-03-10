import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';
import { Auth } from './auth.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export const DB = {
    // Тихое автосохранение
    async saveQuestsSilent(modsData) {
        if (!Auth.user) return;
        try {
            await setDoc(doc(db, "quests", "main"), { mods: modsData });
        } catch (e) {
            console.error("Ошибка автосохранения:", e);
        }
    },

    async loadQuests() {
        try {
            const docSnap = await getDoc(doc(db, "quests", "main"));
            if (docSnap.exists()) return docSnap.data().mods;
            return [];
        } catch (e) {
            console.error("Ошибка загрузки квестов:", e);
            return [];
        }
    },

    // Управление пользователями
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

    // Логи
    async logAction(actionDesc) {
        if (!Auth.user) return;
        try {
            await addDoc(collection(db, "logs"), {
                username: Auth.user.username,
                action: actionDesc,
                timestamp: new Date().getTime() // Используем timestamp для точной сортировки
            });
        } catch (e) {}
    },

    async getLogs() {
        if (!Auth.user) return [];
        const q = query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(50));
        const querySnapshot = await getDocs(q);
        const logs = [];
        querySnapshot.forEach((doc) => logs.push(doc.data()));
        return logs;
    }
};
