// --- CONFIGURAÇÃO DO FIREBASE (Sincronizado) ---
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
const EMAILJS_TEMPLATE_ID = "SEU_TEMPLATE_ID_AQUI"; // <-- Cole aqui seu ID de Template do EmailJS

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
let currentPhotoBase64 = "";
let myChart = null;

const app = {
    // 1. COMPRESSÃO DE IMAGEM VIA CANVAS
    handleImage(input) {
        const file = input.files[0];
        if (!file) return;
        const btn = document.getElementById('btn-save-product');
        btn.disabled = true; btn.innerText = "Compactando...";

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 400; 
                const scale = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH; canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                // Salva como JPG 50% qualidade (muito leve)
                currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.5);
                btn.disabled = false; btn.innerText = "Salvar Alterações";
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    init() {
        console.log("LogMaster: Conectado.");
        db.collection('produtos').orderBy('name').onSnapshot(snapshot => {
            const list = [];
            snapshot.forEach(doc => list.push({id: doc.id, ...doc.data()}));
            this.renderProducts(list);
        });
    },

    // 2. RENDERIZAÇÃO E LOGICA DE ALERTA
    renderProducts(items) {
        const tbody = document.getElementById('stock-list');
        tbody.innerHTML = '';
        items.forEach(item => {
            const threshold = item.minThreshold || 0;
            // Só alerta se tiver um threshold definido e maior que zero
            const isLow = item.qty <= threshold && threshold > 0;
            
            tbody.innerHTML += `
                <tr class="${isLow ? 'low-stock' : ''}">
                    <td><img src="${item.photo || ''}" class="img-thumb" onerror="this.src='https://via.placeholder.com/60'"></td>
                    <td><strong>${item.name}</strong> ${isLow ? '<span class="badge-alert">ESTOQUE BAIXO</span>' : ''}</td>
                    <td>${item.category}</td>
                    <td><h2 style="color:var(--primary)">${item.qty || 0}</h2></td>
                    <td>
                        <div class="action-group">
                            <button class="btn-in" onclick="ui.openMove('${item.id}', '${item.name}', 'ENTRADA')">📥 Entrada</button>
                            <button class="btn-out" onclick="ui.openMove('${item.id}', '${item.name}', 'SAIDA')">📤 Saída</button>
                            <button class="btn-log" onclick="app.showHistory('${item.id}')">📊 Análise</button>
                            <button class="btn-icon" onclick="ui.openEdit('${item.id}', '${item.name}', '${item.category}', ${threshold})" title="Editar">✏️</button>
                            <button class="btn-icon" onclick="app.deleteProduct('${item.id}')" title="Excluir" style="color:red">🗑️</button>
                        </div>
                    </td>
                </tr>
            `;
        });
    },

    // 3. SALVAR / EDITAR PRODUTO
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
            if (editId) {
                await db.collection('produtos').doc(editId).update(data);
            } else {
                data.qty = 0;
                data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('produtos').add(data);
            }
            currentPhotoBase64 = "";
            ui.closeModal('product');
        } catch (err) { alert("Erro ao salvar: " + err.message); }
    },

    // 4. MOVIMENTAÇÃO E DISPARO DE E-MAIL
    async processMove(e) {
        e.preventDefault();
        const pid = document.getElementById('move-product-id').value;
        const type = document.getElementById('move-type').value;
        const qtyMove = parseInt(document.getElementById('move-qty').value);
        const sector = type === 'ENTRADA' ? "REPOSIÇÃO" : document.getElementById('move-sector').value;
        const employee = type === 'ENTRADA' ? "SISTEMA" : document.getElementById('move-employee').value;

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

            // Dispara alerta se estoque ficar baixo após saída
            if (type === 'SAIDA' && newQty <= (pData.minThreshold || 0) && pData.minThreshold > 0) {
                this.sendEmailAlert(pData.name, newQty, pData.minThreshold);
            }

            ui.closeModal('move');
        } catch (err) { alert(err.message); }
    },

    sendEmailAlert(name, qty, limit) {
        const params = { product_name: name, current_qty: qty, min_threshold: limit, to_emails: "seu-email@dominio.com" };
        emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params)
            .then(() => console.log('E-mail enviado.'))
            .catch(err => console.error('Falha e-mail:', err));
    },

    // 5. ESTATÍSTICAS E GRÁFICOS
    async showHistory(pid) {
        const content = document.getElementById('history-content');
        content.innerHTML = '<p style="padding:20px">Calculando tendências...</p>';
        ui.openModal('history');
        const trintaDias = new Date(); trintaDias.setDate(trintaDias.getDate() - 30);
        
        try {
            const snap = await db.collection('historico')
                .where('productId', '==', pid)
                .where('timestamp', '>=', trintaDias)
                .orderBy('timestamp', 'desc').get();
            
            const logs = []; snap.forEach(doc => logs.push(doc.data()));

            const calcMedia = (d) => {
                const limit = new Date(); limit.setDate(limit.getDate() - d);
                const sum = logs.filter(l => l.type === 'SAIDA' && l.timestamp.toDate() >= limit).reduce((s,c)=>s+c.qty, 0);
                return (sum / d).toFixed(1);
            };

            document.getElementById('avg-7').innerText = calcMedia(7);
            document.getElementById('avg-15').innerText = calcMedia(15);
            document.getElementById('avg-30').innerText = calcMedia(30);

            this.renderChart(logs);

            content.innerHTML = '';
            logs.forEach(l => {
                const date = l.timestamp ? l.timestamp.toDate().toLocaleString('pt-BR') : 'Recent';
                content.innerHTML += `
                    <div class="log-item">
                        <span class="${l.type === 'ENTRADA' ? 'badge-in' : 'badge-out'}">${l.type} de ${l.qty} un</span>
                        - <small>${date}</small> | Setor: ${l.sector} | Resp: ${l.employee}
                    </div>`;
            });
            if(logs.length === 0) content.innerHTML = '<p style="padding:20px">Nenhuma movimentação recente.</p>';
        } catch (err) { content.innerHTML = "Erro de Índice: Verifique o link no console (F12) para ativar no Firebase."; }
    },

    renderChart(logs) {
        const ctx = document.getElementById('usageChart').getContext('2d');
        if (myChart) myChart.destroy();
        const dias = [...Array(7)].map((_, i) => {
            const d = new Date(); d.setDate(d.getDate() - i);
            return d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'});
        }).reverse();
        const consumo = dias.map(dia => logs.filter(l => l.type === 'SAIDA' && l.timestamp.toDate().toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}) === dia).reduce((s,c)=>s+c.qty, 0));
        myChart = new Chart(ctx, {
            type: 'line',
            data: { labels: dias, datasets: [{ label: 'Saídas Diárias', data: consumo, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', fill: true, tension: 0.4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    },

    async deleteProduct(id) {
        if (confirm("Excluir este item e todo o seu histórico permanentemente?")) await db.collection('produtos').doc(id).delete();
    }
};

const ui = {
    openModal(id) { document.getElementById(`modal-${id}`).classList.remove('hidden'); },
    closeModal(id) { 
        document.getElementById(`modal-${id}`).classList.add('hidden'); 
        document.querySelector(`#modal-${id} form`).reset(); 
        document.getElementById('p-edit-id').value = "";
        document.getElementById('modal-product-title').innerText = "Cadastrar Item";
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

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('form-product').addEventListener('submit', (e) => app.handleProductSubmit(e));
    document.getElementById('form-move').addEventListener('submit', (e) => app.processMove(e));
    app.init();
});