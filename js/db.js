// js/db.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';
import { Auth } from './auth.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export const DB = {
    async saveQuests(modsData) {
        if (!Auth.user) return;
        try {
            await setDoc(doc(db, "quests", "main"), { mods: modsData });
            this.logAction(`Сохранил изменения в графе квестов`);
            alert('✅ Квесты успешно сохранены в облако!');
        } catch (e) {
            console.error(e);
            alert('❌ Ошибка сохранения. Проверьте права.');
        }
    },

    async loadQuests() {
        try {
            const docSnap = await getDoc(doc(db, "quests", "main"));
            if (docSnap.exists()) {
                return docSnap.data().mods;
            }
            return []; // База пуста
        } catch (e) {
            console.error("Ошибка загрузки квестов:", e);
            return [];
        }
    },

    async logAction(actionDesc) {
        if (!Auth.user) return;
        try {
            await addDoc(collection(db, "logs"), {
                username: Auth.user.username,
                action: actionDesc,
                timestamp: new Date().toISOString()
            });
        } catch (e) {
            console.error("Ошибка записи лога:", e);
        }
    },

    async getLogs() {
        if (!Auth.user) return [];
        const q = query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(50));
        const querySnapshot = await getDocs(q);
        const logs = [];
        querySnapshot.forEach((doc) => {
            logs.push(doc.data());
        });
        return logs;
    }
};
