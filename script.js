// --- CONFIGURAÇÃO FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyD37ZAe9afx70HjjiGQzxbUkrhtYSqVVms",
    authDomain: "estoque-master-ba8d3.firebaseapp.com",
    projectId: "estoque-master-ba8d3",
    storageBucket: "estoque-master-ba8d3.firebasestorage.app",
    messagingSenderId: "541199550434",
    appId: "1:541199550434:web:90083885daa8a9756fdbbb"
};

// --- CONFIGURAÇÃO EMAILJS (v3.9) ---
emailjs.init("Q0pklfvcpouN8CSjW");
const EMAIL_SERVICE = "service_ip0xm56";
const EMAIL_TEMPLATE = "template_04ocb0p"; 

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const fAuth = firebase.auth();

let userRole = "pendente";
let fullInventory = [];
let currentPhotoBase64 = "";
let isSignUpMode = false;
let myChart = null;

// --- AUTENTICAÇÃO ---
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
                alert("Cadastro realizado! Aguarde a liberação do administrador Jefferson.");
            } else { await fAuth.signInWithEmailAndPassword(email, pass); }
        } catch (err) { alert("Erro de Acesso: " + err.message); }
    },
    logout() { fAuth.signOut().then(() => location.reload()); }
};

fAuth.onAuthStateChanged(async (user) => {
    if (user) {
        document.getElementById('auth-screen').classList.add('hidden');
        const userDoc = await db.collection('usuarios').doc(user.email).get();
        userRole = userDoc.exists ? userDoc.data().funcao : "pendente";
        document.getElementById('user-info').innerText = user.email;

        if (userRole === "pendente") {
            document.getElementById('pending-msg').classList.remove('hidden');
            document.getElementById('main-content').classList.add('hidden');
        } else {
            document.getElementById('pending-msg').classList.add('hidden');
            document.getElementById('main-content').classList.remove('hidden');
            if (userRole === "admin") document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
            app.init();
        }
    } else { document.getElementById('auth-screen').classList.remove('hidden'); }
});

// --- LÓGICA DO APP ---
const app = {
    init() {
        db.collection('produtos').orderBy('name').onSnapshot(snap => {
            fullInventory = [];
            snap.forEach(doc => fullInventory.push({id: doc.id, ...doc.data()}));
            this.renderProducts(fullInventory);
        }, err => console.error("Firestore Error (Check AdBlock):", err));
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
                currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.5);
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
            const admin = userRole === "admin" ? `<button class="btn-action in" onclick="ui.openMove('${item.id}', '${item.name}', 'ENTRADA')">In</button><button onclick="ui.openEdit('${item.id}', '${item.name}', '${item.category}', ${threshold})" style="background:none; border:none; cursor:pointer; font-size:1.1rem">✏️</button>` : '';

            tbody.innerHTML += `
                <tr class="${isLow ? 'low-stock' : ''}">
                    <td><img src="${item.photo || 'https://placehold.co/48'}" class="img-thumb"></td>
                    <td><div style="font-weight:700">${item.name}</div>${isLow ? '<span class="badge-low">CRÍTICO</span>' : ''}</td>
                    <td><span style="color:#64748b">${item.category}</span></td>
                    <td><strong style="font-size:1.1rem">${item.qty || 0}</strong></td>
                    <td>
                        <div style="display:flex; justify-content:flex-end; gap:5px;">
                            ${admin}
                            <button class="btn-action out" onclick="ui.openMove('${item.id}', '${item.name}', 'SAIDA')">Out</button>
                            <button class="btn-action chart" onclick="app.showHistory('${item.id}', '${item.name}')">📊</button>
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

        try {
            const productRef = db.collection('produtos').doc(pid);
            const doc = await productRef.get();
            const pData = doc.data();

            // --- BLOQUEIO DE SALDO NEGATIVO (NOVO) ---
            if (type === 'SAIDA' && qtyMove > pData.qty) {
                return alert(`⚠️ Operação cancelada! Você está tentando retirar ${qtyMove}un, mas o saldo atual é de apenas ${pData.qty}un.`);
            }

            const newQty = type === 'ENTRADA' ? (pData.qty + qtyMove) : (pData.qty - qtyMove);

            await productRef.update({ qty: newQty });
            await db.collection('historico').add({
                productId: pid, type, qty: qtyMove, sector, employee: fAuth.currentUser.email,
                productName: pData.name,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            // DISPARO DE EMAIL (SINCRONIZADO v3.9)
            if (type === 'SAIDA' && newQty <= (pData.minThreshold || 0) && pData.minThreshold > 0) {
                const params = {
                    product_name: String(pData.name),
                    current_qty: String(newQty),
                    min_threshold: String(pData.minThreshold)
                };
                emailjs.send(EMAIL_SERVICE, EMAIL_TEMPLATE, params).catch(err => console.error("EmailJS Error", err));
            }
            ui.closeModal('move');
        } catch (err) { alert(err.message); }
    },

    // --- FUNÇÕES DE EXPORTAÇÃO CSV (NOVO) ---
    exportInventory() {
        let csv = "Produto;Categoria;Saldo;Minimo\n";
        fullInventory.forEach(p => {
            csv += `${p.name};${p.category};${p.qty};${p.minThreshold}\n`;
        });
        this.downloadCSV(csv, "Inventario_LogMaster.csv");
    },

    async exportHistory() {
        const trintaDias = new Date(); trintaDias.setDate(trintaDias.getDate() - 30);
        const snap = await db.collection('historico').where('timestamp', '>=', trintaDias).orderBy('timestamp', 'desc').get();
        
        let csv = "Data;Produto;Tipo;Qtd;Setor;Responsavel\n";
        snap.forEach(doc => {
            const d = doc.data();
            const dataStr = d.timestamp ? d.timestamp.toDate().toLocaleString('pt-BR') : 'N/A';
            csv += `${dataStr};${d.productName || 'N/A'};${d.type};${d.qty};${d.sector};${d.employee}\n`;
        });
        this.downloadCSV(csv, "Historico_Mensal_LogMaster.csv");
    },

    downloadCSV(csv, filename) {
        const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", filename);
        link.click();
    },

    async loadUsers() {
        const tbody = document.getElementById('user-admin-list');
        const snap = await db.collection('usuarios').get();
        tbody.innerHTML = "";
        snap.forEach(doc => {
            tbody.innerHTML += `<tr><td>${doc.id}</td><td><strong>${doc.data().funcao}</strong></td><td>
                <select onchange="app.updateUserRole('${doc.id}', this.value)" style="padding:4px; border-radius:6px;">
                    <option value="">Ação...</option>
                    <option value="admin">Admin</option>
                    <option value="colaborador">Colaborador</option>
                    <option value="pendente">Bloquear</option>
                </select>
            </td></tr>`;
        });
    },

    async updateUserRole(email, role) {
        if (!role) return;
        await db.collection('usuarios').doc(email).update({ funcao: role });
        this.loadUsers();
    },

    async showHistory(pid, name) {
        document.getElementById('history-header').innerText = `Consumo: ${name}`;
        ui.openModal('history');
        const trintaDias = new Date(); trintaDias.setDate(trintaDias.getDate() - 30);
        
        setTimeout(async () => {
            const snap = await db.collection('historico').where('productId', '==', pid).where('timestamp', '>=', trintaDias).orderBy('timestamp', 'desc').get();
            const logs = []; snap.forEach(doc => logs.push(doc.data()));
            
            const calc = (d) => {
                const limit = new Date().getTime() - (d * 24 * 60 * 60 * 1000);
                const sum = logs.filter(l => l.type === 'SAIDA' && l.timestamp.toDate().getTime() >= limit).reduce((s,c)=>s+c.qty, 0);
                return (sum / d).toFixed(1);
            };

            document.getElementById('avg-7').innerText = calc(7);
            document.getElementById('avg-30').innerText = calc(30);
            
            this.renderChart(logs);
            document.getElementById('history-content').innerHTML = logs.map(l => `
                <div class="log-item">
                    <span style="color:${l.type === 'ENTRADA' ? 'var(--success)' : 'var(--warning)'}; font-weight:700">${l.type} ${l.qty}un</span>
                    - ${l.sector} | <small>${l.employee}</small>
                </div>`).join('');
        }, 500);
    },

    renderChart(logs) {
        const ctx = document.getElementById('usageChart').getContext('2d');
        if (myChart) myChart.destroy();
        const dias = [...Array(7)].map((_, i) => { 
            const d = new Date(); d.setDate(d.getDate() - i); 
            return d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}); 
        }).reverse();
        const dados = dias.map(dia => logs.filter(l => l.type === 'SAIDA' && l.timestamp.toDate().toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}) === dia).reduce((s,c)=>s+c.qty, 0));
        
        myChart = new Chart(ctx, { 
            type: 'line', 
            data: { 
                labels: dias, 
                datasets: [{ label: 'Consumo', data: dados, borderColor: '#4f46e5', tension: 0.3, fill: true, backgroundColor: 'rgba(79, 70, 229, 0.05)' }] 
            }, 
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } 
        });
    }
};

const ui = {
    openModal(id) { document.getElementById('modal-' + id).classList.remove('hidden'); },
    closeModal(id) { document.getElementById('modal-' + id).classList.add('hidden'); },
    toggleAuthMode() {
        isSignUpMode = !isSignUpMode;
        document.getElementById('auth-title').innerText = isSignUpMode ? "Criar Conta" : "LogMaster Pro";
        document.getElementById('auth-toggle').innerText = isSignUpMode ? "Já tem conta? Entre" : "Novo por aqui? Criar conta";
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