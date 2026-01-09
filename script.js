// --- CONFIGURAÇÃO ---
const firebaseConfig = {
    apiKey: "AIzaSyD37ZAe9afx70HjjiGQzxbUkrhtYSqVVms",
    authDomain: "estoque-master-ba8d3.firebaseapp.com",
    projectId: "estoque-master-ba8d3",
    storageBucket: "estoque-master-ba8d3.firebasestorage.app",
    messagingSenderId: "541199550434",
    appId: "1:541199550434:web:90083885daa8a9756fdbbb"
};

emailjs.init("Q0pklfvcpouN8CSjW");
const EMAIL_SERVICE = "service_ip0xm56";
const EMAIL_TEMPLATE = "template_h537y68";

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const fAuth = firebase.auth();

let userRole = "pendente";
let fullInventory = [];
let currentPhotoBase64 = "";
let isSignUpMode = false;
let myChart = null;

// --- AUTHENTICATION ---
const auth = {
    async handleAuth(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        try {
            if (isSignUpMode) {
                await fAuth.createUserWithEmailAndPassword(email, pass);
                await db.collection('usuarios').doc(email).set({
                    funcao: "pendente", email: email, createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                alert("Sucesso! Aguarde a liberação do Admin.");
            } else {
                await fAuth.signInWithEmailAndPassword(email, pass);
            }
        } catch (err) { alert(err.message); }
    },
    logout() { fAuth.signOut().then(() => location.reload()); }
};

fAuth.onAuthStateChanged(async (user) => {
    if (user) {
        document.getElementById('auth-screen').classList.add('hidden');
        const userDoc = await db.collection('usuarios').doc(user.email).get();
        userRole = userDoc.exists ? userDoc.data().funcao : "pendente";
        document.getElementById('user-info').innerText = `${user.email}`;

        if (userRole === "pendente") {
            document.getElementById('pending-msg').classList.remove('hidden');
            document.getElementById('main-content').classList.add('hidden');
        } else {
            document.getElementById('pending-msg').classList.add('hidden');
            document.getElementById('main-content').classList.remove('hidden');
            if (userRole === "admin") document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
            app.init();
        }
    } else {
        document.getElementById('auth-screen').classList.remove('hidden');
    }
});

// --- CORE APP ---
const app = {
    init() {
        db.collection('produtos').orderBy('name').onSnapshot(snap => {
            fullInventory = [];
            snap.forEach(doc => fullInventory.push({id: doc.id, ...doc.data()}));
            this.renderProducts(fullInventory);
        });
    },

    handleImage(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX = 400; const scale = MAX / img.width;
                canvas.width = MAX; canvas.height = img.height * scale;
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.6);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    filterProducts() {
        const term = document.getElementById('search-input').value.toLowerCase();
        const filtered = fullInventory.filter(i => i.name.toLowerCase().includes(term) || i.category.toLowerCase().includes(term));
        this.renderProducts(filtered);
    },

    renderProducts(items) {
        const tbody = document.getElementById('stock-list');
        tbody.innerHTML = '';
        items.forEach(item => {
            const threshold = item.minThreshold || 0;
            const isLow = item.qty <= threshold && threshold > 0;
            
            // LAYOUT DOS NOVOS BOTÕES SOFISTICADOS
            const adminTools = userRole === "admin" ? `
                <button class="action-btn in" onclick="ui.openMove('${item.id}', '${item.name}', 'ENTRADA')">📥 Repor</button>
                <button class="btn-icon-only" onclick="ui.openEdit('${item.id}', '${item.name}', '${item.category}', ${threshold})" title="Editar">✏️</button>
                <button class="btn-icon-only" onclick="app.deleteProduct('${item.id}')" title="Excluir">🗑️</button>
            ` : '';

            tbody.innerHTML += `
                <tr class="${isLow ? 'low-stock' : ''}">
                    <td><img src="${item.photo || ''}" class="img-thumb" onerror="this.src='https://via.placeholder.com/60'"></td>
                    <td>
                        <div style="font-weight:700">${item.name}</div>
                        ${isLow ? '<span class="status-pill">CRÍTICO</span>' : ''}
                    </td>
                    <td><span style="color:var(--text-sub);font-size:0.85rem">${item.category}</span></td>
                    <td><strong style="font-size:1.1rem">${item.qty || 0}</strong> <small style="color:var(--text-sub)">un</small></td>
                    <td>
                        <div class="action-bar">
                            ${adminTools}
                            <button class="action-btn out" onclick="ui.openMove('${item.id}', '${item.name}', 'SAIDA')">📤 Retirar</button>
                            <button class="action-btn chart" onclick="app.showHistory('${item.id}', '${item.name}')">📊 Analisar</button>
                        </div>
                    </td>
                </tr>`;
        });
    },

    async processMove(e) {
        e.preventDefault();
        const pid = document.getElementById('move-product-id').value;
        const type = document.getElementById('move-type').value;
        const qtyMove = parseInt(document.getElementById('move-qty').value);
        const sector = type === 'ENTRADA' ? "REPOSIÇÃO" : document.getElementById('move-sector').value;
        const employee = fAuth.currentUser.email;

        try {
            const productRef = db.collection('produtos').doc(pid);
            const doc = await productRef.get();
            const pData = doc.data();
            const newQty = type === 'ENTRADA' ? (pData.qty + qtyMove) : (pData.qty - qtyMove);

            if (newQty < 0) return alert("Erro: Saldo insuficiente!");

            await productRef.update({ qty: newQty });
            await db.collection('historico').add({
                productId: pid, type, qty: qtyMove, sector, employee,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            if (type === 'SAIDA' && newQty <= (pData.minThreshold || 0) && pData.minThreshold > 0) {
                emailjs.send(EMAIL_SERVICE, EMAIL_TEMPLATE, {
                    product_name: pData.name, current_qty: newQty, min_threshold: pData.minThreshold,
                    to_emails: "gestor@niteroi.com"
                });
            }
            ui.closeModal('move');
        } catch (err) { alert(err.message); }
    },

    async loadUsers() {
        const tbody = document.getElementById('user-admin-list');
        tbody.innerHTML = "<tr><td colspan='3'>Carregando...</td></tr>";
        const snap = await db.collection('usuarios').get();
        tbody.innerHTML = "";
        snap.forEach(doc => {
            const u = doc.data();
            tbody.innerHTML += `
                <tr>
                    <td>${doc.id}</td>
                    <td><span class="badge">${u.funcao}</span></td>
                    <td>
                        <select class="action-btn" onchange="app.updateUserRole('${doc.id}', this.value)">
                            <option value="">Alterar...</option>
                            <option value="admin">Admin</option>
                            <option value="colaborador">Colaborador</option>
                            <option value="pendente">Bloquear</option>
                        </select>
                    </td>
                </tr>`;
        });
    },

    async updateUserRole(email, role) {
        if (!role) return;
        await db.collection('usuarios').doc(email).update({ funcao: role });
        this.loadUsers();
    },

    async showHistory(pid, name) {
        document.getElementById('history-product-name').innerText = `Análise: ${name}`;
        ui.openModal('history');
        const trintaDias = new Date(); trintaDias.setDate(trintaDias.getDate() - 30);
        const snap = await db.collection('historico').where('productId', '==', pid).where('timestamp', '>=', trintaDias).orderBy('timestamp', 'desc').get();
        const logs = []; snap.forEach(doc => logs.push(doc.data()));
        
        const calcMedia = (d) => {
            const sum = logs.filter(l => l.type === 'SAIDA' && l.timestamp.toDate() >= (new Date() - d*24*60*60*1000)).reduce((s, c) => s + c.qty, 0);
            return (sum / d).toFixed(1);
        };
        document.getElementById('avg-7').innerText = calcMedia(7);
        document.getElementById('avg-30').innerText = calcMedia(30);
        
        this.renderChart(logs);
        document.getElementById('history-content').innerHTML = logs.map(l => `
            <div class="log-item">
                <span class="${l.type === 'ENTRADA' ? 'badge-in' : 'badge-out'}">${l.type} ${l.qty}un</span>
                <span style="color:var(--text-sub)">- ${l.sector || 'N/I'} | ${l.employee}</span>
            </div>`).join('');
    },

    renderChart(logs) {
        const ctx = document.getElementById('usageChart').getContext('2d');
        if (myChart) myChart.destroy();
        const dias = [...Array(7)].map((_, i) => { 
            const d = new Date(); d.setDate(d.getDate() - i); 
            return d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}); 
        }).reverse();
        const dados = dias.map(dia => logs.filter(l => l.type === 'SAIDA' && l.timestamp.toDate().toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}) === dia).reduce((s,c)=>s+c.qty, 0));
        myChart = new Chart(ctx, { type: 'line', data: { labels: dias, datasets: [{ label: 'Consumo', data: dados, borderColor: '#4f46e5', tension: 0.3, fill: true, backgroundColor: 'rgba(79, 70, 229, 0.05)' }] }, options: { responsive: true, maintainAspectRatio: false } });
    },

    async deleteProduct(id) {
        if (confirm("Excluir item e histórico?")) await db.collection('produtos').doc(id).delete();
    }
};

const ui = {
    openModal(id) { document.getElementById('modal-' + id).classList.remove('hidden'); },
    closeModal(id) { document.getElementById('modal-' + id).classList.add('hidden'); },
    toggleAuthMode() {
        isSignUpMode = !isSignUpMode;
        document.getElementById('auth-title').innerText = isSignUpMode ? "Criar Conta" : "LogMaster Pro";
        document.getElementById('btn-auth-submit').innerText = isSignUpMode ? "Finalizar Cadastro" : "Entrar no Painel";
        document.getElementById('auth-toggle').innerText = isSignUpMode ? "Já tem conta? Entrar" : "Novo por aqui? Criar conta";
    },
    openEdit(id, name, cat, min) {
        document.getElementById('p-edit-id').value = id;
        document.getElementById('p-name').value = name;
        document.getElementById('p-category').value = cat;
        document.getElementById('p-min').value = min;
        this.openModal('product');
    },
    openMove(id, name, type) {
        document.getElementById('move-product-id').value = id;
        document.getElementById('move-type').value = type;
        const extra = document.getElementById('extra-fields');
        type === 'ENTRADA' ? extra.classList.add('hidden') : extra.classList.remove('hidden');
        this.openModal('move');
    }
};

document.getElementById('login-form').addEventListener('submit', auth.handleAuth);
document.getElementById('form-product').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('p-edit-id').value;
    const data = {
        name: document.getElementById('p-name').value, category: document.getElementById('p-category').value,
        minThreshold: parseInt(document.getElementById('p-min').value), updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (currentPhotoBase64) data.photo = currentPhotoBase64;
    id ? db.collection('produtos').doc(id).update(data) : db.collection('produtos').add({...data, qty: 0});
    ui.closeModal('product');
});
document.getElementById('form-move').addEventListener('submit', app.processMove);