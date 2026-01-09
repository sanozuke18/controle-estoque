// --- CONFIGURAÇÃO FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyD37ZAe9afx70HjjiGQzxbUkrhtYSqVVms",
    authDomain: "estoque-master-ba8d3.firebaseapp.com",
    projectId: "estoque-master-ba8d3",
    storageBucket: "estoque-master-ba8d3.firebasestorage.app",
    messagingSenderId: "541199550434",
    appId: "1:541199550434:web:90083885daa8a9756fdbbb"
};

// --- CONFIGURAÇÃO EMAILJS ---
emailjs.init("Q0pklfvcpouN8CSjW");
const EMAILJS_SERVICE_ID = "service_ip0xm56";
const EMAILJS_TEMPLATE_ID = "template_h537y68";

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const fAuth = firebase.auth();

let userRole = "colaborador";
let fullInventory = [];
let currentPhotoBase64 = "";
let myChart = null;

// --- GESTÃO DE ACESSO ---
const auth = {
    login(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        fAuth.signInWithEmailAndPassword(email, pass).catch(err => alert("Acesso negado: " + err.message));
    },
    logout() { fAuth.signOut().then(() => location.reload()); }
};

fAuth.onAuthStateChanged(async (user) => {
    if (user) {
        const userDoc = await db.collection('usuarios').doc(user.email).get();
        userRole = userDoc.exists ? userDoc.data().funcao : "colaborador";
        
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('user-info').innerText = `${user.email} (${userRole})`;
        
        if (userRole === "admin") {
            document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
        }
        app.init();
    } else {
        document.getElementById('auth-screen').classList.remove('hidden');
    }
});

const app = {
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
                currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.5);
                console.log("Foto pronta.");
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    init() {
        db.collection('produtos').orderBy('name').onSnapshot(snapshot => {
            fullInventory = [];
            snapshot.forEach(doc => fullInventory.push({id: doc.id, ...doc.data()}));
            this.renderProducts(fullInventory);
        });
    },

    filterProducts() {
        const term = document.getElementById('search-input').value.toLowerCase();
        const filtered = fullInventory.filter(i => 
            i.name.toLowerCase().includes(term) || i.category.toLowerCase().includes(term)
        );
        this.renderProducts(filtered);
    },

    renderProducts(items) {
        const tbody = document.getElementById('stock-list');
        tbody.innerHTML = '';
        items.forEach(item => {
            const threshold = item.minThreshold || 0;
            const isLow = item.qty <= threshold && threshold > 0;
            
            const adminButtons = userRole === "admin" ? `
                <button class="btn-in" onclick="ui.openMove('${item.id}', '${item.name}', 'ENTRADA')">📥 Repor</button>
                <button class="btn-icon" onclick="ui.openEdit('${item.id}', '${item.name}', '${item.category}', ${threshold})">✏️</button>
                <button class="btn-icon" onclick="app.deleteProduct('${item.id}')" style="color:red">🗑️</button>
            ` : '';

            tbody.innerHTML += `
                <tr class="${isLow ? 'low-stock' : ''}">
                    <td><img src="${item.photo || ''}" class="img-thumb" onerror="this.src='https://via.placeholder.com/65'"></td>
                    <td><strong>${item.name}</strong> ${isLow ? '<span class="badge-alert">ESTOQUE BAIXO</span>' : ''}</td>
                    <td>${item.category}</td>
                    <td><h2>${item.qty || 0}</h2></td>
                    <td>
                        <div class="action-group">
                            ${adminButtons}
                            <button class="btn-out" onclick="ui.openMove('${item.id}', '${item.name}', 'SAIDA')">📤 Retirar</button>
                            <button class="btn-log" onclick="app.showHistory('${item.id}')">📊 Logs</button>
                        </div>
                    </td>
                </tr>
            `;
        });
    },

    async handleProductSubmit(e) {
        e.preventDefault();
        const editId = document.getElementById('p-edit-id').value;
        const data = {
            name: document.getElementById('p-name').value,
            category: document.getElementById('p-category').value,
            minThreshold: parseInt(document.getElementById('p-min').value),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (currentPhotoBase64) data.photo = currentPhotoBase64;
        
        try {
            if (editId) await db.collection('produtos').doc(editId).update(data);
            else { data.qty = 0; data.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await db.collection('produtos').add(data); }
            currentPhotoBase64 = "";
            ui.closeModal('product');
        } catch (err) { alert(err.message); }
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

            if (newQty < 0) return alert("Saldo insuficiente!");

            await productRef.update({ qty: newQty });
            await db.collection('historico').add({
                productId: pid, type, qty: qtyMove, sector, employee,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            if (type === 'SAIDA' && newQty <= (pData.minThreshold || 0) && pData.minThreshold > 0) {
                emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
                    product_name: pData.name, current_qty: newQty, min_threshold: pData.minThreshold,
                    to_emails: "gestor@niteroi.com"
                });
            }
            ui.closeModal('move');
        } catch (err) { alert(err.message); }
    },

    async showHistory(pid) {
        ui.openModal('history');
        const content = document.getElementById('history-content');
        content.innerHTML = "Carregando...";
        const trintaDias = new Date(); trintaDias.setDate(trintaDias.getDate() - 30);
        
        try {
            const snap = await db.collection('historico').where('productId', '==', pid).where('timestamp', '>=', trintaDias).orderBy('timestamp', 'desc').get();
            const logs = []; snap.forEach(doc => logs.push(doc.data()));
            
            this.renderChart(logs);
            const calcMedia = (d) => {
                const limit = new Date(); limit.setDate(limit.getDate() - d);
                const sum = logs.filter(l => l.type === 'SAIDA' && l.timestamp.toDate() >= limit).reduce((s,c)=>s+c.qty, 0);
                return (sum / d).toFixed(1);
            };
            document.getElementById('avg-7').innerText = calcMedia(7);
            document.getElementById('avg-30').innerText = calcMedia(30);

            content.innerHTML = logs.map(l => `
                <div class="log-item">
                    <strong>${l.type} de ${l.qty} un</strong> - Setor: ${l.sector} | 
                    <small>Por: ${l.employee}</small>
                </div>
            `).join('') || "Nenhuma movimentação recente.";
        } catch (err) { content.innerHTML = "Erro de Índice: Ative no console F12."; }
    },

    renderChart(logs) {
        const ctx = document.getElementById('usageChart').getContext('2d');
        if (myChart) myChart.destroy();
        const dias = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}); }).reverse();
        const dados = dias.map(dia => logs.filter(l => l.type === 'SAIDA' && l.timestamp.toDate().toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}) === dia).reduce((s,c)=>s+c.qty, 0));
        myChart = new Chart(ctx, { type: 'line', data: { labels: dias, datasets: [{ label: 'Consumo Diário', data: dados, borderColor: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.1)', fill: true, tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false } });
    },

    async deleteProduct(id) {
        if (confirm("Excluir item e histórico permanentemente?")) await db.collection('produtos').doc(id).delete();
    }
};

// --- GESTOR DE MODAIS (Refinado) ---
const ui = {
    openModal(id) {
        const modal = document.getElementById('modal-' + id);
        if (modal) modal.classList.remove('hidden');
    },
    closeModal(id) {
        const modal = document.getElementById('modal-' + id);
        if (modal) {
            modal.classList.add('hidden');
            const form = modal.querySelector('form');
            if (form) form.reset();
            if (id === 'product') document.getElementById('p-edit-id').value = "";
        }
    },
    openEdit(id, name, cat, min) {
        document.getElementById('p-edit-id').value = id;
        document.getElementById('p-name').value = name;
        document.getElementById('p-category').value = cat;
        document.getElementById('p-min').value = min;
        document.getElementById('modal-product-title').innerText = "Editar Produto";
        this.openModal('product');
    },
    openMove(id, name, type) {
        document.getElementById('move-product-id').value = id;
        document.getElementById('move-type').value = type;
        document.getElementById('move-title').innerText = type === 'ENTRADA' ? `Reposição: ${name}` : `Retirada: ${name}`;
        const extra = document.getElementById('extra-fields');
        type === 'ENTRADA' ? extra.classList.add('hidden') : extra.classList.remove('hidden');
        this.openModal('move');
    }
};

// EVENTOS
document.getElementById('login-form').addEventListener('submit', auth.login);
document.getElementById('form-product').addEventListener('submit', app.handleProductSubmit);
document.getElementById('form-move').addEventListener('submit', app.processMove);