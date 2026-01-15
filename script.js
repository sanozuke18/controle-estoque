/* =================================================================
   LOGMASTER PRO v14.3 - SISTEMA DE GESTÃO DE ESTOQUE SEMOBI
   + MÓDULO DE AUTENTICAÇÃO E PERMISSÕES
================================================================= */

// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyD37ZAe9afx70HjjiGQzxbUkrhtYSqVVms",
    authDomain: "estoque-master-ba8d3.firebaseapp.com",
    projectId: "estoque-master-ba8d3",
    storageBucket: "estoque-master-ba8d3.firebasestorage.app",
    messagingSenderId: "541199550434",
    appId: "1:541199550434:web:90083885daa8a9756fdbbb"
};

// Inicialização dos Serviços Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const fAuth = firebase.auth();

// Configuração do EmailJS
const EMAILJS_PUBLIC_KEY = "Q0pklfvcpouN8CSjW";
const EMAILJS_SERVICE_ID = "service_ip0xm56";
const EMAILJS_TEMPLATE_ID = "template_04ocb0p";

// Variáveis de Estado
let fullInventory = [];
let myChart = null;
let adminChart15 = null;
let categories = [];
let alertConfig = { email: "" };
let currentViewedLogs = [];
let calendarDate = new Date();
let currentPhotoBase64 = "";
let sessionManualAlerts = {};
const MASTER_KEY = "1234";

/* ===================== SISTEMA DE AUTENTICAÇÃO E PERMISSÕES ===================== */

let currentUser = null;

const PERMISSIONS = {
    admin: {
        label: 'Administrador',
        viewStock: true,
        moveStock: true,
        createProduct: true,
        editProduct: true,
        deleteProduct: true,
        viewShopping: true,
        viewAdmin: true,
        manageUsers: true,
        manageCategories: true,
        exportReports: true
    },
    supervisor: {
        label: 'Supervisor',
        viewStock: true,
        moveStock: true,
        createProduct: true,
        editProduct: false,
        deleteProduct: false,
        viewShopping: true,
        viewAdmin: false,
        manageUsers: false,
        manageCategories: true,
        exportReports: true
    },
    operador: {
        label: 'Operador',
        viewStock: true,
        moveStock: true,
        createProduct: false,
        editProduct: false,
        deleteProduct: false,
        viewShopping: false,
        viewAdmin: false,
        manageUsers: false,
        manageCategories: false,
        exportReports: false
    }
};

const auth = {
    init() {
        db.collection('usuarios').orderBy('createdAt', 'desc').onSnapshot(snap => {
            const users = [];
            snap.forEach(doc => users.push({ id: doc.id, ...doc.data() }));
            this.renderUsersList(users);
        });
    },

    async ensureDefaultAdmin() {
        const adminDoc = await db.collection('usuarios').doc('admin').get();
        if (!adminDoc.exists) {
            await db.collection('usuarios').doc('admin').set({
                username: 'admin',
                password: this.hashPassword('admin123'),
                role: 'admin',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                isDefault: true
            });
            console.log('Usuário admin padrão criado.');
        }
    },

    hashPassword(pass) {
        let hash = 0;
        for (let i = 0; i < pass.length; i++) {
            const char = pass.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return 'hash_' + Math.abs(hash).toString(16);
    },

    async login(e) {
        e.preventDefault();
        const username = document.getElementById('login-user').value.trim().toLowerCase();
        const password = document.getElementById('login-pass').value;
        const errorEl = document.getElementById('login-error');
        
        errorEl.textContent = '';

        try {
            const userDoc = await db.collection('usuarios').doc(username).get();
            
            if (!userDoc.exists) {
                errorEl.textContent = 'Usuário não encontrado.';
                return;
            }

            const userData = userDoc.data();
            const hashedInput = this.hashPassword(password);

            if (userData.password !== hashedInput) {
                errorEl.textContent = 'Senha incorreta.';
                return;
            }

            currentUser = {
                id: userDoc.id,
                username: userData.username,
                role: userData.role,
                permissions: PERMISSIONS[userData.role]
            };

            localStorage.setItem('logmaster_session', JSON.stringify({
                id: currentUser.id,
                role: currentUser.role
            }));

            document.getElementById('login-screen').classList.add('hidden');
            this.updateUI();
            this.applyPermissions();

            // Inicia app e lista de usuários
            app.init();
            this.init();

        } catch (error) {
            console.error('Erro no login:', error);
            errorEl.textContent = 'Erro ao conectar. Tente novamente.';
        }
    },

    async checkSession() {
        const session = localStorage.getItem('logmaster_session');
        if (session) {
            try {
                const { id } = JSON.parse(session);
                const userDoc = await db.collection('usuarios').doc(id).get();
                
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    currentUser = {
                        id: userDoc.id,
                        username: userData.username,
                        role: userData.role,
                        permissions: PERMISSIONS[userData.role]
                    };
                    document.getElementById('login-screen').classList.add('hidden');
                    this.updateUI();
                    this.applyPermissions();
                    app.init();
                    this.init();
                    return true;
                }
            } catch (e) {
                console.error('Sessão inválida:', e);
            }
        }
        document.getElementById('login-screen').classList.remove('hidden');
        return false;
    },

    logout() {
        if (confirm('Deseja realmente sair do sistema?')) {
            localStorage.removeItem('logmaster_session');
            currentUser = null;
            location.reload();
        }
    },

    updateUI() {
        if (!currentUser) return;
        document.getElementById('logged-user-name').textContent = currentUser.username;
        const roleEl = document.getElementById('logged-user-role');
        roleEl.textContent = currentUser.permissions.label;
        roleEl.className = 'user-role';
        
        if (currentUser.role === 'supervisor') {
            roleEl.classList.add('role-supervisor');
        } else if (currentUser.role === 'operador') {
            roleEl.classList.add('role-operador');
        }
    },

    applyPermissions() {
        if (!currentUser) return;
        const p = currentUser.permissions;

        const tabShopping = document.querySelector('[onclick*="switchView(\'shopping\')"]');
        if (tabShopping) tabShopping.classList.toggle('permission-hidden', !p.viewShopping);

        const tabAdmin = document.querySelector('[onclick*="switchView(\'admin\')"]');
        if (tabAdmin) tabAdmin.classList.toggle('permission-hidden', !p.viewAdmin);

        const btnAddProduct = document.querySelector('[onclick*="openAddModal"]');
        if (btnAddProduct) btnAddProduct.classList.toggle('permission-hidden', !p.createProduct);

        const btnCategories = document.querySelector('[onclick*="openModal(\'categories\')"]');
        if (btnCategories) btnCategories.classList.toggle('permission-hidden', !p.manageCategories);

        document.querySelectorAll('[onclick*="exportCSV"], [onclick*="generatePDF"]').forEach(btn => {
            btn.classList.toggle('permission-hidden', !p.exportReports);
        });

        // Gestão de usuários: oculta seção se não for admin
        const usersSection = document.getElementById('users-management');
        if (usersSection) {
            usersSection.classList.toggle('permission-hidden', !p.manageUsers);
        }
    },

    can(permission) {
        if (!currentUser) return false;
        return currentUser.permissions[permission] === true;
    },

    async createUser() {
        if (!this.can('manageUsers')) {
            return alert('Você não tem permissão para criar usuários.');
        }

        const username = document.getElementById('new-user-name').value.trim().toLowerCase();
        const password = document.getElementById('new-user-pass').value;
        const role = document.getElementById('new-user-role').value;

        if (!username || !password) {
            return alert('Preencha usuário e senha.');
        }

        if (username.length < 3) {
            return alert('Usuário deve ter pelo menos 3 caracteres.');
        }

        if (password.length < 4) {
            return alert('Senha deve ter pelo menos 4 caracteres.');
        }

        const existing = await db.collection('usuarios').doc(username).get();
        if (existing.exists) {
            return alert('Este nome de usuário já existe.');
        }

        try {
            await db.collection('usuarios').doc(username).set({
                username: username,
                password: this.hashPassword(password),
                role: role,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: currentUser.username
            });

            document.getElementById('new-user-name').value = '';
            document.getElementById('new-user-pass').value = '';
            alert('Usuário criado com sucesso!');
        } catch (error) {
            console.error('Erro ao criar usuário:', error);
            alert('Erro ao criar usuário.');
        }
    },

    async deleteUser(userId) {
        if (!this.can('manageUsers')) {
            return alert('Você não tem permissão.');
        }

        if (userId === 'admin') {
            return alert('O usuário admin padrão não pode ser excluído.');
        }

        if (userId === currentUser.id) {
            return alert('Você não pode excluir seu próprio usuário.');
        }

        if (confirm(`Excluir o usuário "${userId}"?`)) {
            try {
                await db.collection('usuarios').doc(userId).delete();
                alert('Usuário excluído.');
            } catch (e) {
                alert('Erro ao excluir.');
            }
        }
    },

    async resetPassword(userId) {
        if (!this.can('manageUsers')) return;

        const newPass = prompt(`Digite a nova senha para "${userId}":`);
        if (!newPass || newPass.length < 4) {
            return alert('Senha deve ter pelo menos 4 caracteres.');
        }

        try {
            await db.collection('usuarios').doc(userId).update({
                password: this.hashPassword(newPass)
            });
            alert('Senha alterada com sucesso!');
        } catch (e) {
            alert('Erro ao alterar senha.');
        }
    },

    renderUsersList(users) {
        const tbody = document.getElementById('users-list');
        if (!tbody) return;

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Nenhum usuário cadastrado.</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(u => {
            const roleLabel = PERMISSIONS[u.role]?.label || u.role;
            const createdAt = u.createdAt ? u.createdAt.toDate().toLocaleDateString('pt-BR') : '-';
            const isDefault = u.isDefault ? ' (padrão)' : '';
            
            return `
                <tr>
                    <td><strong>${u.username}</strong>${isDefault}</td>
                    <td>
                        <span class="user-role ${u.role === 'supervisor' ? 'role-supervisor' : ''} ${u.role === 'operador' ? 'role-operador' : ''}" style="display:inline-block;">
                            ${roleLabel}
                        </span>
                    </td>
                    <td>${createdAt}</td>
                    <td class="text-right">
                        <button class="btn-outline-small" onclick="auth.resetPassword('${u.id}')">🔑 Resetar</button>
                        <button class="btn-outline-small" style="color:var(--danger); border-color:var(--danger);" onclick="auth.deleteUser('${u.id}')" ${u.isDefault ? 'disabled style="opacity:0.5;"' : ''}>🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');
    }
};

/* ===================== APP PRINCIPAL (SEU CÓDIGO ORIGINAL) ===================== */

const app = {
    init() {
        db.collection('config').doc('alerts').onSnapshot(doc => {
            if (doc.exists()) {
                alertConfig = doc.data();
                const input = document.getElementById('alert-email-input');
                if (input) input.value = alertConfig.email || "";
            }
        });

        db.collection('produtos').orderBy('name').onSnapshot(snap => {
            fullInventory = [];
            snap.forEach(doc => fullInventory.push({ id: doc.id, ...doc.data() }));
            
            this.renderProducts(fullInventory);
            this.renderShoppingList(fullInventory);
            this.renderAlertCountdown();
            this.checkTenDayAlerts();
            
            const adminView = document.getElementById('view-admin');
            if (adminView && !adminView.classList.contains('hidden')) {
                this.showCategorySummaries();
            }
        }, error => {
            console.error("Erro ao buscar produtos:", error);
        });

        db.collection('categorias').orderBy('name').onSnapshot(snap => {
            categories = [];
            snap.forEach(doc => categories.push({ id: doc.id, ...doc.data() }));
            this.renderCategoriesList();
            this.populateCategorySelect();
        });
    },

    async handleProductSubmit(e) {
        e.preventDefault();
        
        const id = document.getElementById('p-id').value;
        const name = document.getElementById('p-name').value.trim();
        const category = document.getElementById('p-category').value;
        const minThreshold = parseInt(document.getElementById('p-min').value);

        if (!name || !category || isNaN(minThreshold)) {
            return alert("Por favor, preencha todos os campos obrigatórios.");
        }

        const data = {
            name: name,
            category: category,
            minThreshold: minThreshold,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (currentPhotoBase64) {
            data.photo = currentPhotoBase64;
        }

        try {
            if (id) {
                await db.collection('produtos').doc(id).update(data);
                alert("Produto atualizado com sucesso!");
            } else {
                await db.collection('produtos').add({ ...data, qty: 0 });
                alert("Novo insumo cadastrado!");
            }
            this.closeProductModal();
        } catch (err) {
            console.error("Erro ao salvar produto:", err);
            alert("Erro ao salvar. Tente novamente.");
        }
    },

    openAddModal() {
        if (!auth.can('createProduct')) {
            return alert('Você não tem permissão para cadastrar produtos.');
        }
        document.getElementById('product-modal-title').innerText = "Novo Insumo";
        document.getElementById('p-id').value = "";
        document.getElementById('form-product').reset();
        document.getElementById('img-status').innerText = "Aguardando seleção de arquivo...";
        currentPhotoBase64 = "";
        ui.openModal('product');
    },

    async openEditModal(id) {
        if (!auth.can('editProduct')) {
            return alert('Você não tem permissão para editar produtos.');
        }

        if (prompt("Digite a Senha Mestra para editar:") !== MASTER_KEY) return alert("Senha incorreta.");
        
        const p = fullInventory.find(i => i.id === id);
        if (!p) return alert("Produto não encontrado.");

        document.getElementById('product-modal-title').innerText = "Editar: " + p.name;
        document.getElementById('p-id').value = id;
        document.getElementById('p-name').value = p.name;
        document.getElementById('p-category').value = p.category || "";
        document.getElementById('p-min').value = p.minThreshold;
        
        currentPhotoBase64 = "";
        document.getElementById('img-status').innerText = p.photo ? "✅ Imagem atual mantida (envie outra para substituir)." : "Nenhuma imagem cadastrada.";
        
        ui.openModal('product');
    },

    closeProductModal() {
        currentPhotoBase64 = "";
        ui.closeModal('product');
        document.getElementById('form-product').reset();
    },

    handleImage(input) {
        const file = input.files[0];
        const status = document.getElementById('img-status');
        
        if (!file) return;

        if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
            alert("Formato inválido. Use apenas PNG ou JPG.");
            input.value = "";
            return;
        }

        status.innerText = "Compactando imagem, aguarde...";

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 400;
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.7);
                status.innerText = "✅ Imagem pronta para envio!";
            };
            img.onerror = () => {
                status.innerText = "Erro ao processar imagem.";
                alert("Erro ao ler o arquivo de imagem.");
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    async deleteItem(id, name) {
        if (!auth.can('deleteProduct')) {
            return alert('Você não tem permissão para excluir produtos.');
        }

        if (confirm(`Tem certeza que deseja excluir o insumo "${name}"?`)) {
            if (prompt("Digite a Senha Mestra para confirmar a exclusão:") === MASTER_KEY) {
                try {
                    await db.collection('produtos').doc(id).delete();
                    alert("Produto excluído.");
                } catch (e) {
                    alert("Erro ao excluir.");
                }
            } else {
                alert("Senha incorreta. Operação cancelada.");
            }
        }
    },

    async openMove(id, type) {
        if (!auth.can('moveStock')) {
            return alert('Você não tem permissão para movimentar estoque.');
        }

        const prod = fullInventory.find(i => i.id === id);
        if (!prod) return;

        document.getElementById('move-id').value = id;
        document.getElementById('move-type').value = type;
        document.getElementById('move-label').innerText = type === 'ENTRADA' ? `Repor: ${prod.name}` : `Retirar: ${prod.name}`;
        
        const extraFields = document.getElementById('extra-fields');
        if (type === 'SAIDA') {
            extraFields.classList.remove('hidden');
            document.getElementById('move-sector').setAttribute('required', 'required');
        } else {
            extraFields.classList.add('hidden');
            document.getElementById('move-sector').removeAttribute('required');
        }
        
        ui.openModal('move');
    },

    async processMove(e) {
        e.preventDefault();
        
        if (!auth.can('moveStock')) {
            return alert('Você não tem permissão para movimentar estoque.');
        }

        const id = document.getElementById('move-id').value;
        const type = document.getElementById('move-type').value;
        const qty = parseInt(document.getElementById('move-qty').value);
        const sector = document.getElementById('move-sector').value.trim();
        const processNo = document.getElementById('move-process').value.trim();

        if (isNaN(qty) || qty <= 0) return alert("Quantidade inválida.");

        const ref = db.collection('produtos').doc(id);
        
        try {
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(ref);
                if (!doc.exists) throw "Produto não existe!";
                
                const p = doc.data();
                let newQty = p.qty;

                if (type === 'SAIDA') {
                    if (qty > p.qty) throw "Saldo insuficiente para esta retirada!";
                    newQty -= qty;
                } else {
                    newQty += qty;
                }

                transaction.update(ref, { qty: newQty });

                const historyRef = db.collection('historico').doc();
                transaction.set(historyRef, {
                    productId: id,
                    productName: p.name,
                    category: p.category,
                    type: type,
                    qty: qty,
                    sector: type === 'SAIDA' ? (sector || 'N/A') : 'REPOSIÇÃO',
                    process: processNo || '-',
                    employee: currentUser ? currentUser.username : "Usuário LogMaster",
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
            });

            ui.closeModal('move');
            document.getElementById('form-move').reset();
            alert("Movimentação registrada com sucesso!");

        } catch (error) {
            console.error("Erro na transação:", error);
            alert(error);
        }
    },

    renderProducts(items) {
        const tbody = document.getElementById('stock-list');
        if (!tbody) return;

        if (items.length === 0) {
            tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding: 20px; color: #64748b;'>Nenhum insumo encontrado.</td></tr>";
            return;
        }
        
        tbody.innerHTML = items.map(item => {
            const min = Number(item.minThreshold) || 0;
            const qty = Number(item.qty) || 0;
            
            let rowClass = '';
            if (qty <= min) {
                rowClass = 'row-critical';
            } else if (qty <= min * 1.5) {
                rowClass = 'row-warning';
            }

            const canEdit = auth.can('editProduct');
            const canDelete = auth.can('deleteProduct');

            return `
                <tr class="${rowClass}" onclick="app.showHistory('${item.id}', '${item.name}')" title="Clique para ver análise detalhada">
                    <td><img src="${item.photo || 'https://via.placeholder.com/50?text=Sem+Foto'}" class="img-thumb" alt="${item.name}"></td>
                    <td><strong>${item.name}</strong></td>
                    <td><span style="background:#f1f5f9; padding: 4px 10px; border-radius: 12px; font-size:12px;">${item.category}</span></td>
                    <td><strong style="font-size: 1.1rem;">${qty}</strong> <span style="font-size:11px; color:#64748b;">(Mín: ${min})</span></td>
                    <td class="text-right">
                        <div style="display:flex; gap:12px; justify-content:flex-end; align-items:center;" onclick="event.stopPropagation()">
                            <div class="frame-ops">
                                <button class="btn-capsule btn-in" onclick="app.openMove('${item.id}', 'ENTRADA')">Repor</button>
                                <button class="btn-capsule btn-out" onclick="app.openMove('${item.id}', 'SAIDA')">Retirar</button>
                            </div>
                            <div style="display:flex; gap:8px;">
                                <button class="btn-icon ${!canEdit ? 'permission-hidden' : ''}" onclick="app.openEditModal('${item.id}')" title="Editar">✏️</button>
                                <button class="btn-icon ${!canDelete ? 'permission-hidden' : ''}" style="color:var(--danger); border-color:var(--danger);" onclick="app.deleteItem('${item.id}', '${item.name}')" title="Excluir">🗑️</button>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },

    filter() {
        const term = document.getElementById('search-input').value.toLowerCase().trim();
        const filtered = fullInventory.filter(i => 
            i.name.toLowerCase().includes(term) || 
            (i.category || '').toLowerCase().includes(term)
        );
        this.renderProducts(filtered);
    },

    async showHistory(pid, name) {
        document.getElementById('history-header').innerText = `Análise: ${name}`;
        ui.openModal('history');
        
        const snap = await db.collection('historico')
            .where('productId', '==', pid)
            .orderBy('timestamp', 'desc')
            .limit(300)
            .get();
            
        currentViewedLogs = [];
        snap.forEach(d => currentViewedLogs.push(d.data()));
        
        this.filterHistory(15);
        this.renderCalendar();
    },

    filterHistory(days) {
        document.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('highlight'));
        const card = document.getElementById(`kpi-${days}`);
        if (card) card.classList.add('highlight');
        
        const cutoffTime = new Date().getTime() - (days * 24 * 60 * 60 * 1000);
        
        const filteredLogs = currentViewedLogs.filter(l => l.timestamp && l.timestamp.toDate().getTime() >= cutoffTime);
        
        const totalSaidas = filteredLogs
            .filter(l => l.type === 'SAIDA')
            .reduce((sum, log) => sum + log.qty, 0);
            
        const avg = Math.round(totalSaidas / days);
        const avgEl = document.getElementById(`avg-${days}`);
        if (avgEl) avgEl.innerText = avg;
        
        this.renderChart(filteredLogs);
        const titleEl = document.getElementById('log-title');
        if (titleEl) titleEl.innerText = `Movimentações Recentes (Últimos ${days} dias)`;
        this.renderTimeline(filteredLogs);
        
        document.querySelectorAll('.cal-day').forEach(d => d.style.background = "");
    },

    filterByDay(day, month, year, element) {
        document.querySelectorAll('.cal-day').forEach(d => d.style.background = "");
        if(element) element.style.background = "var(--success)";
        
        const targetDateStr = new Date(year, month, day).toLocaleDateString('pt-BR');
        const titleEl = document.getElementById('log-title');
        if (titleEl) titleEl.innerText = `Movimentações em ${targetDateStr}`;
        
        const filtered = currentViewedLogs.filter(l => {
            if(!l.timestamp) return false;
            return l.timestamp.toDate().toLocaleDateString('pt-BR') === targetDateStr;
        });
        
        this.renderTimeline(filtered);
    },

    renderTimeline(logs) {
        const tbody = document.getElementById('history-content');
        if (!tbody) return;

        if (logs.length === 0) {
            tbody.innerHTML = "<tr><td colspan='4' style='text-align:center; color:#94a3b8; padding:15px;'>Nenhuma movimentação no período selecionado.</td></tr>";
            return;
        }
        tbody.innerHTML = logs.map(l => `
            <tr>
                <td style="font-size:12px; font-weight:600;">${l.timestamp ? l.timestamp.toDate().toLocaleString('pt-BR') : 'Data N/D'}</td>
                <td><span style="color:${l.type === 'SAIDA' ? 'var(--warning)' : 'var(--success)'}; font-weight:800; font-size:11px; text-transform:uppercase;">${l.type}</span></td>
                <td><strong>${l.qty}</strong></td>
                <td><span style="color:#64748b; font-size:12px;">${l.sector || '-'}</span></td>
            </tr>
        `).join('');
    },

    renderChart(logs) {
        const canvas = document.getElementById('usageChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        if (myChart instanceof Chart) {
            myChart.destroy();
        }

        const dailyUsage = {};
        logs.forEach(l => {
            if (l.type === 'SAIDA' && l.timestamp) {
                const dateStr = l.timestamp.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                dailyUsage[dateStr] = (dailyUsage[dateStr] || 0) + l.qty;
            }
        });

        const labels = Object.keys(dailyUsage).reverse();
        const dataPoints = Object.values(dailyUsage).reverse();

        myChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Quantidade Retirada',
                    data: dataPoints,
                    backgroundColor: '#4f46e5',
                    borderRadius: 6,
                    barThickness: 'flex',
                    maxBarThickness: 30
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        titleFont: { weight: 'bold' },
                        callbacks: { label: (c) => `Retirado: ${c.raw} un` }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#e2e8f0', drawBorder: false },
                        ticks: { font: { size: 11 }, stepSize: 1 }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10 } }
                    }
                }
            }
        });
    },

    renderCalendar() {
        const grid = document.getElementById('calendar-root');
        if (!grid) return;

        grid.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:15px; align-items:center;">
                <button onclick="app.changeMonth(-1)" class="btn-outline-small" style="padding: 4px 10px;">❮</button>
                <span id="cal-title" style="font-weight:800; font-size:14px; color:var(--primary);"></span>
                <button onclick="app.changeMonth(1)" class="btn-outline-small" style="padding: 4px 10px;">❯</button>
            </div>
            <div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:8px; margin-bottom:8px; text-align:center; font-size:10px; font-weight:700; color:#94a3b8;">
                <div>D</div><div>S</div><div>T</div><div>Q</div><div>Q</div><div>S</div><div>S</div>
            </div>
            <div class="cal-grid" id="cal-days"></div>
        `;

        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();

        document.getElementById('cal-title').innerText = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(calendarDate).toUpperCase();

        const firstDayOfWeek = new Date(year, month, 1).getDay();
        const lastDateOfMonth = new Date(year, month + 1, 0).getDate();
        const calDaysContainer = document.getElementById('cal-days');

        for (let i = 0; i < firstDayOfWeek; i++) {
            calDaysContainer.innerHTML += `<div></div>`;
        }

        for (let d = 1; d <= lastDateOfMonth; d++) {
            const dateStr = new Date(year, month, d).toLocaleDateString('pt-BR');
            const hasUsage = currentViewedLogs.some(l => l.timestamp && l.timestamp.toDate().toLocaleDateString('pt-BR') === dateStr);
            
            calDaysContainer.innerHTML += `
                <div class="cal-day ${hasUsage ? 'has-usage' : ''}" 
                     ${hasUsage ? `onclick="app.filterByDay(${d}, ${month}, ${year}, this)"` : ''}>
                    ${d}
                </div>
            `;
        }
    },

    changeMonth(dir) {
        calendarDate.setMonth(calendarDate.getMonth() + dir);
        this.renderCalendar();
    },

    async renderShoppingList(items) {
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() - 15);

        const historySnap = await db.collection('historico')
            .where('type', '==', 'SAIDA')
            .where('timestamp', '>=', limitDate)
            .get();

        const usageMap = {};
        historySnap.forEach(doc => {
            const data = doc.data();
            usageMap[data.productId] = (usageMap[data.productId] || 0) + Number(data.qty);
        });

        const tbody = document.getElementById('shopping-list');
        if (!tbody) return;

        if (items.length === 0) {
            tbody.innerHTML = "<tr><td colspan='5' class='text-center'>Nenhum dado para análise.</td></tr>";
            return;
        }

        tbody.innerHTML = items.map(i => {
            const totalUsage15d = usageMap[i.id] || 0;
            const dailyAvg = totalUsage15d / 15;
            const currentStock = Number(i.qty) || 0;
            const daysRemaining = dailyAvg > 0.01 ? Math.floor(currentStock / dailyAvg) : Infinity;

            let dateLimitStr = "ESTÁVEL (Sem uso recente)";
            let badgeClass = "badge-safe";

            if (daysRemaining !== Infinity) {
                if (daysRemaining <= 0) {
                    dateLimitStr = "ESGOTADO / CRÍTICO";
                    badgeClass = "badge-critical";
                } else {
                    const estimatedDate = new Date();
                    estimatedDate.setDate(estimatedDate.getDate() + daysRemaining);
                    dateLimitStr = estimatedDate.toLocaleDateString('pt-BR');
                    badgeClass = daysRemaining <= 5 ? "badge-critical" : "badge-safe";
                }
            }
            
            const daysDisplay = daysRemaining === Infinity ? '---' : (daysRemaining <= 0 ? '0 dias' : `${daysRemaining} dias`);

            return `
                <tr>
                    <td><strong>${i.name}</strong></td>
                    <td>
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-weight:800; font-size:1.1rem;">${currentStock}</span>
                            <span style="font-size:10px; color:#64748b;">Mínimo: ${i.minThreshold}</span>
                        </div>
                    </td>
                    <td>${dailyAvg > 0 ? dailyAvg.toFixed(1) + ' / dia' : '<span style="color:#94a3b8;">Sem consumo</span>'}</td>
                    <td><span class="badge-predict ${badgeClass}">${daysDisplay}</span></td>
                    <td class="text-right" style="font-weight:700; color: var(--text);">${dateLimitStr}</td>
                </tr>
            `;
        }).join('');
    },

    renderAlertCountdown() {
        const tbody = document.getElementById('alert-countdown-list');
        if (!tbody) return;

        const lowStockItems = fullInventory.filter(i => Number(i.qty) <= Number(i.minThreshold));

        if (lowStockItems.length === 0) {
            tbody.innerHTML = "<tr><td colspan='3' style='text-align:center; padding: 20px; color: var(--success); font-weight:700;'>✅ Todos os níveis de estoque estão saudáveis.</td></tr>";
            return;
        }

        const now = new Date();
        tbody.innerHTML = lowStockItems.map(i => {
            const lowSinceDate = i.lowStockSince ? i.lowStockSince.toDate() : now;
            const daysInAlert = Math.floor((now - lowSinceDate) / (24 * 60 * 60 * 1000));
            
            const hasSentInSession = sessionManualAlerts[i.id] ? " ✅ Enviado" : "";
            const disabledAttr = sessionManualAlerts[i.id] ? "disabled style='opacity:0.6; cursor:not-allowed;'" : "";

            return `
                <tr>
                    <td><strong>${i.name}</strong><br><small style="color:#64748b;">Saldo: ${i.qty} (Mín: ${i.minThreshold})</small></td>
                    <td><span style="font-weight:700; color:${daysInAlert >= 10 ? 'var(--danger)' : 'var(--warning)'};">${daysInAlert} dias</span></td>
                    <td class="text-right">
                        <button class="btn-outline-small" ${disabledAttr} onclick="app.sendManualAlert('${i.id}', '${i.name}', ${i.qty}, ${i.minThreshold})">
                            DISPARAR ALERTA${hasSentInSession}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    async sendManualAlert(id, prodName, qty, min) {
        if (!alertConfig.email) return alert("Por favor, configure um e-mail destinatário primeiro.");
        
        const btn = document.activeElement;
        const originalText = btn.innerText;
        btn.innerText = "Enviando...";
        btn.disabled = true;

        try {
            await this.sendEmailAlert(prodName, qty, min, "Disparo Manual via Painel de Gestão");
            sessionManualAlerts[id] = true;
            this.renderAlertCountdown();
            alert(`Alerta para ${prodName} enviado com sucesso!`);
        } catch (error) {
            alert("Erro ao enviar e-mail. Verifique o console.");
            btn.innerText = originalText;
            btn.disabled = false;
        }
    },

    async checkTenDayAlerts() {
        if (!alertConfig.email) return;

        const now = new Date();
        const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

        fullInventory.forEach(async (p) => {
            const currentQty = Number(p.qty);
            const minThreshold = Number(p.minThreshold);

            if (currentQty <= minThreshold) {
                if (!p.lowStockSince) {
                    await db.collection('produtos').doc(p.id).update({
                        lowStockSince: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    return;
                }

                const timeInAlert = now - p.lowStockSince.toDate();
                if (timeInAlert >= TEN_DAYS_MS) {
                    const lastAlertDate = p.lastAlertSent ? p.lastAlertSent.toDate() : new Date(0);
                    const timeSinceLastEmail = now - lastAlertDate;

                    if (timeSinceLastEmail >= TEN_DAYS_MS) {
                        this.sendEmailAlert(p.name, currentQty, minThreshold, "Alerta Automático (Ciclo de 10 dias)");
                        
                        await db.collection('produtos').doc(p.id).update({
                            lastAlertSent: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }
                }
            } else {
                if (p.lowStockSince || p.lastAlertSent) {
                    await db.collection('produtos').doc(p.id).update({
                        lowStockSince: null,
                        lastAlertSent: null
                    });
                }
            }
        });
    },

    async sendEmailAlert(prodName, qty, min, origin = "Sistema LogMaster") {
        const templateParams = {
            to_email: alertConfig.email,
            product_name: prodName,
            current_qty: qty,
            min_threshold: min,
            alert_origin: origin,
            timestamp: new Date().toLocaleString('pt-BR')
        };

        try {
            await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams);
        } catch (error) {
            console.error("Falha no envio de e-mail:", error);
            throw error;
        }
    },

    async saveAlertConfig() {
        const email = document.getElementById('alert-email-input').value.trim();
        if (!email || !email.includes('@')) return alert("E-mail inválido.");

        try {
            await db.collection('config').doc('alerts').set({ email: email }, { merge: true });
            alert("E-mail de notificação salvo com sucesso!");
        } catch (e) {
            alert("Erro ao salvar configuração.");
        }
    },

    async showCategorySummaries() {
        const canvas = document.getElementById('adminChart15');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        if (adminChart15 instanceof Chart) {
            adminChart15.destroy();
        }

        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() - 15);

        const historySnap = await db.collection('historico')
            .where('type', '==', 'SAIDA')
            .where('timestamp', '>=', limitDate)
            .get();

        const categoryTotals = {};
        historySnap.forEach(doc => {
            const data = doc.data();
            if (data.category) {
                categoryTotals[data.category] = (categoryTotals[data.category] || 0) + data.qty;
            }
        });

        if (Object.keys(categoryTotals).length === 0) return;

        adminChart15 = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(categoryTotals),
                datasets: [{
                    label: 'Total de Saídas (15d)',
                    data: Object.values(categoryTotals),
                    backgroundColor: '#4f46e5',
                    borderRadius: 8,
                    barThickness: 40
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        callbacks: { label: (c) => `${c.raw} unidades retiradas` }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#e2e8f0' },
                        ticks: { stepSize: 5 }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    },

    async addCategory() {
        if (!auth.can('manageCategories')) {
            return alert('Você não tem permissão para gerenciar categorias.');
        }

        const name = document.getElementById('new-cat-name').value.trim();
        if (!name) return alert("Digite um nome para a categoria.");
        
        if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            return alert("Esta categoria já existe.");
        }

        await db.collection('categorias').add({ name: name });
        document.getElementById('new-cat-name').value = "";
    },

    async deleteCategory(id) {
        if (!auth.can('manageCategories')) {
            return alert('Você não tem permissão para gerenciar categorias.');
        }

        if (confirm("Tem certeza? Isso não excluirá os produtos, apenas a categoria da lista.")) {
            await db.collection('categorias').doc(id).delete();
        }
    },

    renderCategoriesList() {
        const tbody = document.getElementById('categories-list');
        if (!tbody) return;

        if (categories.length === 0) {
            tbody.innerHTML = "<tr><td colspan='2'>Nenhuma categoria cadastrada.</td></tr>";
            return;
        }
        tbody.innerHTML = categories.map(c => `
            <tr>
                <td><strong>${c.name}</strong></td>
                <td class="text-right">
                    <button onclick="app.deleteCategory('${c.id}')" style="color:var(--danger); background:none; border:none; cursor:pointer; font-size:1.1rem;" title="Excluir Categoria">🗑️</button>
                </td>
            </tr>
        `).join('');
    },

    populateCategorySelect() {
        const select = document.getElementById('p-category');
        if (!select) return;
        select.innerHTML = `<option value="">Selecione uma categoria...</option>` + 
            categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    },

    exportCSV() {
        if (!auth.can('exportReports')) {
            return alert('Você não tem permissão para exportar relatórios.');
        }

        if (fullInventory.length === 0) return alert("Nada para exportar.");
        
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "ID do Produto,Nome,Categoria,Saldo Atual,Estoque Minimo,Status\n";
        
        fullInventory.forEach(p => {
            const status = Number(p.qty) <= Number(p.minThreshold) ? "CRITICO" : "OK";
            const escapedName = p.name.replace(/"/g, '""');
            csvContent += `"${p.id}","${escapedName}","${p.category}",${p.qty},${p.minThreshold},"${status}"\n`;
        });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
        link.setAttribute("download", `Estoque_SEMOBI_${dateStr}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    generatePDF() {
        if (!auth.can('exportReports')) {
            return alert('Você não tem permissão para exportar relatórios.');
        }

        if (fullInventory.length === 0) return alert("Nada para gerar PDF.");

        const template = document.getElementById('pdf-template');
        if (!template) return;

        let htmlContent = `
            <div style="font-family: sans-serif; padding: 30px;">
                <h2 style="color: #4f46e5; text-align: center;">Relatório de Estoque - SEMOBI Niterói</h2>
                <p style="text-align: center; color: #64748b; margin-bottom: 30px;">Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
                <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                    <thead>
                        <tr style="background: #f1f5f9; text-align: left;">
                            <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">Produto</th>
                            <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">Categoria</th>
                            <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">Saldo</th>
                            <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        fullInventory.forEach(p => {
            const qty = Number(p.qty);
            const min = Number(p.minThreshold);
            const statusColor = qty <= min ? '#ef4444' : (qty <= min * 1.5 ? '#f59e0b' : '#10b981');
            const statusText = qty <= min ? 'CRÍTICO' : (qty <= min * 1.5 ? 'BAIXO' : 'ADEQUADO');
            
            htmlContent += `
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>${p.name}</strong></td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${p.category}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${qty} (Mín: ${min})</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: ${statusColor}; font-weight: bold;">${statusText}</td>
                </tr>
            `;
        });

        htmlContent += `
                    </tbody>
                </table>
                <p style="margin-top: 30px; text-align: center; font-size: 10px; color: #94a3b8;">© 2026 LogMaster Pro - Documento Confidencial</p>
            </div>
        `;

        template.innerHTML = htmlContent;
        template.style.display = 'block';

        const opt = {
            margin: 10,
            filename: `Relatorio_Estoque_SEMOBI_${new Date().getTime()}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        html2pdf().from(template).set(opt).save().then(() => {
            template.style.display = 'none';
            template.innerHTML = '';
        });
    },

    async loadAuditLogs() {
        ui.openModal('audit');
        const tbody = document.getElementById('audit-list');
        if (!tbody) return;

        tbody.innerHTML = "<tr><td colspan='4' class='text-center'>Carregando registros...</td></tr>";

        try {
            const snap = await db.collection('historico')
                .orderBy('timestamp', 'desc')
                .limit(50)
                .get();

            if (snap.empty) {
                tbody.innerHTML = "<tr><td colspan='4' class='text-center'>Nenhum registro de auditoria encontrado.</td></tr>";
                return;
            }

            tbody.innerHTML = snap.docs.map(doc => {
                const data = doc.data();
                const dateStr = data.timestamp ? data.timestamp.toDate().toLocaleString('pt-BR') : 'Data N/D';
                const typeColor = data.type === 'SAIDA' ? 'var(--warning)' : (data.type === 'ENTRADA' ? 'var(--success)' : 'var(--primary)');
                
                let details = `Qtd: ${data.qty}`;
                if (data.sector && data.sector !== 'N/A') details += ` | Setor: ${data.sector}`;
                if (data.process && data.process !== '-') details += ` | Proc: ${data.process}`;

                return `
                    <tr>
                        <td style="font-size:12px;">${dateStr}</td>
                        <td>${data.employee || 'Admin'}</td>
                        <td><span style="font-weight:800; color:${typeColor};">${data.type}</span></td>
                        <td>
                            <strong>${data.productName}</strong><br>
                            <small style="color:#64748b;">${details}</small>
                        </td>
                    </tr>
                `;
            }).join('');

        } catch (e) {
            console.error("Erro ao carregar auditoria:", e);
            tbody.innerHTML = "<tr><td colspan='4' style='color:var(--danger);'>Erro ao carregar registros.</td></tr>";
        }
    }
};

/* ===================== UI ===================== */

const ui = {
    switchView(v) {
        document.querySelectorAll('.view-sec').forEach(s => s.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        
        const view = document.getElementById('view-' + v);
        const tab = document.getElementById('tab-' + v);
        if (view) view.classList.remove('hidden');
        if (tab) tab.classList.add('active');
        
        if (v === 'admin') {
            app.showCategorySummaries();
        }
        window.scrollTo(0, 0);
    },

    openModal(m) {
        const el = document.getElementById('modal-' + m);
        if (!el) return;
        el.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    },

    closeModal(m) {
        const el = document.getElementById('modal-' + m);
        if (!el) return;
        el.classList.add('hidden');
        document.body.style.overflow = '';
    },

    toggleDarkMode() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    }
};

/* ===================== INICIALIZAÇÃO GLOBAL ===================== */

window.onload = async () => {
    try {
        emailjs.init(EMAILJS_PUBLIC_KEY);
        await fAuth.signInAnonymously();
        console.log("Conectado ao Firebase com sucesso.");

        await auth.ensureDefaultAdmin();

        const hasSession = await auth.checkSession();

        document.getElementById('loading-screen').classList.add('hidden');

        if (!hasSession) {
            // app.init() será chamado após login
        }

    } catch (e) {
        console.error("Erro crítico na inicialização:", e);
        alert("Falha ao conectar com o servidor. Verifique sua internet.");
    }
};

document.getElementById('form-move').addEventListener('submit', app.processMove);
document.getElementById('form-product').addEventListener('submit', app.handleProductSubmit);

if (localStorage.getItem('theme') === 'dark') {
    ui.toggleDarkMode();
}