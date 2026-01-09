const firebaseConfig = {
    apiKey: "AIzaSyD37ZAe9afx70HjjiGQzxbUkrhtYSqVVms",
    authDomain: "estoque-master-ba8d3.firebaseapp.com",
    projectId: "estoque-master-ba8d3",
    storageBucket: "estoque-master-ba8d3.firebasestorage.app",
    messagingSenderId: "541199550434",
    appId: "1:541199550434:web:90083885daa8a9756fdbbb"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
let currentPhotoBase64 = "";
let myChart = null;

const app = {
    // Compressor de Imagem
    handleImage(input) {
        const file = input.files[0];
        if (!file) return;
        const btn = document.getElementById('btn-save-product');
        btn.disabled = true;
        btn.innerText = "Processando...";

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 400; 
                const scale = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.5);
                btn.disabled = false;
                btn.innerText = "Salvar";
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    init() {
        db.collection('produtos').orderBy('name').onSnapshot(snapshot => {
            const list = [];
            snapshot.forEach(doc => list.push({id: doc.id, ...doc.data()}));
            this.renderProducts(list);
        });
    },

    renderProducts(items) {
        const tbody = document.getElementById('stock-list');
        tbody.innerHTML = '';
        items.forEach(item => {
            tbody.innerHTML += `
                <tr>
                    <td><img src="${item.photo || ''}" class="img-thumb" onerror="this.src='https://via.placeholder.com/50'"></td>
                    <td><strong>${item.name}</strong></td>
                    <td>${item.category}</td>
                    <td><h2 style="color:var(--primary)">${item.qty || 0}</h2></td>
                    <td>
                        <div class="action-group">
                            <button class="btn-in" onclick="ui.openMove('${item.id}', '${item.name}', 'ENTRADA')">📥</button>
                            <button class="btn-out" onclick="ui.openMove('${item.id}', '${item.name}', 'SAIDA')">📤</button>
                            <button class="btn-log" onclick="app.showHistory('${item.id}')">📈 Log</button>
                            <button style="background:none; border:none; cursor:pointer" onclick="app.deleteProduct('${item.id}')">🗑️</button>
                        </div>
                    </td>
                </tr>
            `;
        });
    },

    async addProduct(e) {
        e.preventDefault();
        const data = {
            name: document.getElementById('p-name').value,
            category: document.getElementById('p-category').value,
            photo: currentPhotoBase64,
            qty: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection('produtos').add(data);
        currentPhotoBase64 = "";
        ui.closeModal('product');
    },

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
            const currentQty = doc.data().qty || 0;
            const newQty = type === 'ENTRADA' ? currentQty + qtyMove : currentQty - qtyMove;
            
            if (newQty < 0) return alert("Saldo insuficiente!");

            await productRef.update({ qty: newQty });
            await db.collection('historico').add({
                productId: pid,
                type,
                qty: qtyMove,
                sector,
                employee,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            ui.closeModal('move');
        } catch (err) { alert(err.message); }
    },

    async showHistory(pid) {
        const historyContent = document.getElementById('history-content');
        historyContent.innerHTML = 'Calculando estatísticas...';
        ui.openModal('history');

        const trintaDiasAtras = new Date();
        trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

        try {
            const snapshot = await db.collection('historico')
                .where('productId', '==', pid)
                .where('timestamp', '>=', trintaDiasAtras)
                .orderBy('timestamp', 'desc').get();

            const logs = [];
            snapshot.forEach(doc => logs.push(doc.data()));

            // Médias
            const calcMedia = (dias) => {
                const limite = new Date();
                limite.setDate(limite.getDate() - dias);
                const total = logs.filter(l => l.type === 'SAIDA' && l.timestamp.toDate() >= limite)
                                  .reduce((s, c) => s + c.qty, 0);
                return (total / dias).toFixed(1);
            };

            document.getElementById('avg-7').innerText = calcMedia(7);
            document.getElementById('avg-15').innerText = calcMedia(15);
            document.getElementById('avg-30').innerText = calcMedia(30);

            this.renderChart(logs);

            historyContent.innerHTML = '';
            logs.forEach(d => {
                const date = d.timestamp ? d.timestamp.toDate().toLocaleString('pt-BR') : 'Agora';
                historyContent.innerHTML += `
                    <div class="log-item">
                        <span class="${d.type === 'ENTRADA' ? 'badge-in' : 'badge-out'}">${d.type} ${d.qty}un</span>
                        - ${date} | Setor: ${d.sector} | Resp: ${d.employee}
                    </div>
                `;
            });
        } catch (err) { historyContent.innerHTML = "Erro: " + err.message; }
    },

    renderChart(logs) {
        const ctx = document.getElementById('usageChart').getContext('2d');
        if (myChart) myChart.destroy();

        const dias = [...Array(7)].map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'});
        }).reverse();

        const consumo = dias.map(dia => {
            return logs.filter(l => l.type === 'SAIDA' && l.timestamp.toDate().toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}) === dia)
                       .reduce((s, c) => s + c.qty, 0);
        });

        myChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dias,
                datasets: [{
                    label: 'Saídas Diárias',
                    data: consumo,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245,158,11,0.1)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    },

    async deleteProduct(id) {
        if (confirm("Excluir item e histórico?")) await db.collection('produtos').doc(id).delete();
    }
};

const ui = {
    openModal(id) { document.getElementById(`modal-${id}`).classList.remove('hidden'); },
    closeModal(id) { document.getElementById(`modal-${id}`).classList.add('hidden'); if(id!=='history') document.querySelector(`#modal-${id} form`).reset(); },
    openMove(id, name, type) {
        document.getElementById('move-product-id').value = id;
        document.getElementById('move-type').value = type;
        document.getElementById('move-title').innerText = type === 'ENTRADA' ? `Entrada: ${name}` : `Saída: ${name}`;
        const extra = document.getElementById('extra-fields');
        type === 'ENTRADA' ? extra.classList.add('hidden') : extra.classList.remove('hidden');
        this.openModal('move');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('form-product').addEventListener('submit', (e) => app.addProduct(e));
    document.getElementById('form-move').addEventListener('submit', (e) => app.processMove(e));
    app.init();
});