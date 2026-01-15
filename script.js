/* =================================================================
   LOGMASTER PRO v14.3 - SISTEMA DE GESTÃO DE ESTOQUE SEMOBI
   - Recursos: Firebase Firestore/Auth, Chart.js, EmailJS, html2pdf
   - Funcionalidades: Estoque Real-time, Predição, Alertas, Auditoria
================================================================= */

// Configuração do Firebase (Substitua pelos seus dados reais se necessário)
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

// Configuração do EmailJS (Serviço de envio de e-mails)
const EMAILJS_PUBLIC_KEY = "Q0pklfvcpouN8CSjW";
const EMAILJS_SERVICE_ID = "service_ip0xm56";
const EMAILJS_TEMPLATE_ID = "template_04ocb0p";

// Variáveis Globais de Estado
let fullInventory = []; // Armazena todo o estoque localmente
let myChart = null;     // Instância do gráfico de análise individual
let adminChart15 = null; // Instância do gráfico de saídas mensais
let categories = [];    // Lista de categorias fixas
let alertConfig = { email: "" }; // Configuração de e-mail destinatário
let currentViewedLogs = []; // Logs do produto sendo visualizado no momento
let calendarDate = new Date(); // Data base para o calendário
let currentPhotoBase64 = ""; // Armazena temporariamente a imagem compactada
let sessionManualAlerts = {}; // Controle de sessão para disparos manuais de alerta
const MASTER_KEY = "1234"; // Senha mestra para operações críticas (ex: deletar)

// Inicialização do Sistema ao Carregar a Página
window.onload = async () => {
    try {
        // Inicializa EmailJS
        emailjs.init(EMAILJS_PUBLIC_KEY);
        
        // Autenticação Anônima no Firebase (Necessária para regras de segurança)
        await fAuth.signInAnonymously();
        console.log("Conectado ao Firebase com sucesso.");
        
        // Remove a tela de carregamento
        document.getElementById('loading-screen').classList.add('hidden');
        
        // Inicia os ouvintes do banco de dados
        app.init();
    } catch (e) {
        console.error("Erro crítico na inicialização:", e);
        alert("Falha ao conectar com o servidor. Verifique sua internet.");
    }
};

// Objeto Principal da Aplicação
const app = {
    // Configura os Listeners (Ouvintes) em Tempo Real do Firestore
    init() {
        // 1. Ouvinte de Configuração de Alertas
        db.collection('config').doc('alerts').onSnapshot(doc => {
            if (doc.exists()) {
                alertConfig = doc.data();
                document.getElementById('alert-email-input').value = alertConfig.email || "";
            }
        });

        // 2. Ouvinte Principal de Produtos (Estoque)
        db.collection('produtos').orderBy('name').onSnapshot(snap => {
            fullInventory = [];
            snap.forEach(doc => fullInventory.push({ id: doc.id, ...doc.data() }));
            
            // Atualiza as interfaces dependentes dos dados de produtos
            this.renderProducts(fullInventory); // Tabela de Estoque
            this.renderShoppingList(fullInventory); // Tabela de Compras/Predição
            this.renderAlertCountdown(); // Monitor de Alertas na Gestão
            this.checkTenDayAlerts(); // Verificação automática de alertas de 10 dias
            
            // Se a aba de gestão estiver visível, atualiza o gráfico de saídas
            if (!document.getElementById('view-admin').classList.contains('hidden')) {
                this.showCategorySummaries();
            }
        }, error => {
            console.error("Erro ao buscar produtos:", error);
        });

        // 3. Ouvinte de Categorias
        db.collection('categorias').orderBy('name').onSnapshot(snap => {
            categories = [];
            snap.forEach(doc => categories.push({ id: doc.id, ...doc.data() }));
            this.renderCategoriesList(); // Lista no modal de categorias
            this.populateCategorySelect(); // Dropdown nos formulários
        });
    },

    /* ================= FUNÇÕES DE PRODUTO (CADASTRO/EDIÇÃO) ================= */

    // Processa o formulário de produto (Novo ou Edição)
    async handleProductSubmit(e) {
        e.preventDefault();
        
        const id = document.getElementById('p-id').value; // Se tiver ID, é edição. Se não, é novo.
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
            updatedAt: firebase.firestore.FieldValue.serverTimestamp() // Marca temporal do servidor
        };

        // Só adiciona a foto se uma nova foi carregada e compactada
        if (currentPhotoBase64) {
            data.photo = currentPhotoBase64;
        }

        try {
            if (id) {
                // Modo Edição: Atualiza o documento existente
                await db.collection('produtos').doc(id).update(data);
                alert("Produto atualizado com sucesso!");
            } else {
                // Modo Cadastro: Cria novo documento com saldo inicial zero
                await db.collection('produtos').add({ ...data, qty: 0 });
                alert("Novo insumo cadastrado!");
            }
            this.closeProductModal();
        } catch (err) {
            console.error("Erro ao salvar produto:", err);
            alert("Erro ao salvar. Tente novamente.");
        }
    },

    // Abre o modal para NOVO cadastro
    openAddModal() {
        document.getElementById('product-modal-title').innerText = "Novo Insumo";
        document.getElementById('p-id').value = ""; // Limpa o ID para indicar novo cadastro
        document.getElementById('form-product').reset();
        document.getElementById('img-status').innerText = "Aguardando seleção de arquivo...";
        currentPhotoBase64 = ""; // Reseta o cache de imagem
        ui.openModal('product');
    },

    // Abre o modal para EDIÇÃO de um produto existente
    async openEditModal(id) {
        // Solicita senha mestra para segurança
        if (prompt("Digite a Senha Mestra para editar:") !== MASTER_KEY) return alert("Senha incorreta.");
        
        const p = fullInventory.find(i => i.id === id);
        if (!p) return alert("Produto não encontrado.");

        document.getElementById('product-modal-title').innerText = "Editar: " + p.name;
        document.getElementById('p-id').value = id; // Define o ID para modo edição
        document.getElementById('p-name').value = p.name;
        document.getElementById('p-category').value = p.category || "";
        document.getElementById('p-min').value = p.minThreshold;
        
        // Reseta o cache de nova imagem, mas indica se já existe uma no banco
        currentPhotoBase64 = "";
        document.getElementById('img-status').innerText = p.photo ? "✅ Imagem atual mantida (envie outra para substituir)." : "Nenhuma imagem cadastrada.";
        
        ui.openModal('product');
    },

    // Fecha o modal de produto e limpa os estados
    closeProductModal() {
        currentPhotoBase64 = "";
        ui.closeModal('product');
        document.getElementById('form-product').reset();
    },

    // Processamento e Compactação de Imagem (PNG/JPG) usando Canvas
    handleImage(input) {
        const file = input.files[0];
        const status = document.getElementById('img-status');
        
        if (!file) return;

        // Validação de tipo MIME
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
                // Cria um canvas para redimensionar a imagem
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 400; // Largura máxima definida para 400px
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // Converte o canvas para JPEG com 70% de qualidade (ótima compressão)
                currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.7);
                status.innerText = "✅ Imagem pronta para envio!";
                console.log("Imagem compactada com sucesso.");
            };
            img.onerror = () => {
                status.innerText = "Erro ao processar imagem.";
                alert("Erro ao ler o arquivo de imagem.");
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    // Deleta um produto (protegido por senha mestra)
    async deleteItem(id, name) {
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

    /* ================= FUNÇÕES DE MOVIMENTAÇÃO (ENTRADA/SAÍDA) ================= */

    // Abre o modal de lançamento de estoque
    async openMove(id, type) {
        const prod = fullInventory.find(i => i.id === id);
        if (!prod) return;

        document.getElementById('move-id').value = id;
        document.getElementById('move-type').value = type;
        document.getElementById('move-label').innerText = type === 'ENTRADA' ? `Repor: ${prod.name}` : `Retirar: ${prod.name}`;
        
        // Mostra/oculta campos extras dependendo do tipo de operação
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

    // Processa o lançamento de estoque
    async processMove(e) {
        e.preventDefault();
        
        const id = document.getElementById('move-id').value;
        const type = document.getElementById('move-type').value;
        const qty = parseInt(document.getElementById('move-qty').value);
        const sector = document.getElementById('move-sector').value.trim();
        const processNo = document.getElementById('move-process').value.trim();

        if (isNaN(qty) || qty <= 0) return alert("Quantidade inválida.");

        const ref = db.collection('produtos').doc(id);
        
        try {
            // Transação para garantir atomicidade (leitura + escrita seguras)
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

                // Atualiza o saldo do produto
                transaction.update(ref, { qty: newQty });

                // Registra o histórico na coleção 'historico'
                const historyRef = db.collection('historico').doc();
                transaction.set(historyRef, {
                    productId: id,
                    productName: p.name,
                    category: p.category,
                    type: type,
                    qty: qty,
                    sector: type === 'SAIDA' ? (sector || 'N/A') : 'REPOSIÇÃO',
                    process: processNo || '-',
                    employee: "Usuário LogMaster", // Pode ser substituído por auth real no futuro
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

    /* ================= FUNÇÕES DE VISUALIZAÇÃO E ANÁLISE ================= */

    // Renderiza a tabela principal de estoque
    renderProducts(items) {
        const tbody = document.getElementById('stock-list');
        if (items.length === 0) {
            tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding: 20px; color: #64748b;'>Nenhum insumo encontrado.</td></tr>";
            return;
        }
        
        tbody.innerHTML = items.map(item => {
            const min = Number(item.minThreshold) || 0;
            const qty = Number(item.qty) || 0;
            
            // Define a classe CSS da linha baseada no nível de estoque
            let rowClass = '';
            if (qty <= min) {
                rowClass = 'row-critical'; // Vermelho se abaixo ou igual ao mínimo
            } else if (qty <= min * 1.5) {
                rowClass = 'row-warning'; // Amarelo se próximo ao mínimo (margem de 50%)
            }

            // Renderiza a linha da tabela
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
                                <button class="btn-icon" onclick="app.openEditModal('${item.id}')" title="Editar">✏️</button>
                                <button class="btn-icon" style="color:var(--danger); border-color:var(--danger);" onclick="app.deleteItem('${item.id}', '${item.name}')" title="Excluir">🗑️</button>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },

    // Função de busca/filtro na tabela de estoque
    filter() {
        const term = document.getElementById('search-input').value.toLowerCase().trim();
        // Filtra por nome ou categoria
        const filtered = fullInventory.filter(i => 
            i.name.toLowerCase().includes(term) || 
            (i.category || '').toLowerCase().includes(term)
        );
        this.renderProducts(filtered);
    },

    /* ================= FUNÇÕES DE ANÁLISE TÉCNICA (MODAL FLUTUANTE) ================= */

    // Abre o modal de histórico e carrega os dados
    async showHistory(pid, name) {
        document.getElementById('history-header').innerText = `Análise: ${name}`;
        ui.openModal('history');
        
        // Busca os últimos 300 logs deste produto
        const snap = await db.collection('historico')
            .where('productId', '==', pid)
            .orderBy('timestamp', 'desc')
            .limit(300)
            .get();
            
        currentViewedLogs = [];
        snap.forEach(d => currentViewedLogs.push(d.data()));
        
        // Filtro inicial de 15 dias
        this.filterHistory(15);
        // Renderiza o calendário
        this.renderCalendar();
    },

    // Filtra o histórico por período (7, 15, 30 dias) e atualiza KPIs e Gráfico
    filterHistory(days) {
        // Atualiza estado visual dos cards de KPI
        document.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('highlight'));
        document.getElementById(`kpi-${days}`).classList.add('highlight');
        
        const cutoffTime = new Date().getTime() - (days * 24 * 60 * 60 * 1000);
        
        // Filtra logs dentro do período
        const filteredLogs = currentViewedLogs.filter(l => l.timestamp && l.timestamp.toDate().getTime() >= cutoffTime);
        
        // Calcula o total de saídas no período
        const totalSaidas = filteredLogs
            .filter(l => l.type === 'SAIDA')
            .reduce((sum, log) => sum + log.qty, 0);
            
        // Calcula e exibe a média diária (arredondada)
        const avg = Math.round(totalSaidas / days);
        document.getElementById(`avg-${days}`).innerText = avg;
        
        // Atualiza o gráfico e a tabela de logs
        this.renderChart(filteredLogs);
        document.getElementById('log-title').innerText = `Movimentações Recentes (Últimos ${days} dias)`;
        this.renderTimeline(filteredLogs);
        
        // Reseta a seleção visual do calendário
        document.querySelectorAll('.cal-day').forEach(d => d.style.background = "");
    },

    // Filtra logs por um dia específico clicado no calendário
    filterByDay(day, month, year, element) {
        // Atualiza seleção visual no calendário
        document.querySelectorAll('.cal-day').forEach(d => d.style.background = "");
        if(element) element.style.background = "var(--success)"; // Cor verde para indicar seleção

        const targetDateStr = new Date(year, month, day).toLocaleDateString('pt-BR');
        document.getElementById('log-title').innerText = `Movimentações em ${targetDateStr}`;
        
        // Filtra logs que correspondem exatamente à data clicada (comparação de string local)
        const filtered = currentViewedLogs.filter(l => {
            if(!l.timestamp) return false;
            return l.timestamp.toDate().toLocaleDateString('pt-BR') === targetDateStr;
        });
        
        this.renderTimeline(filtered);
    },

    // Renderiza a tabela de logs (timeline)
    renderTimeline(logs) {
        const tbody = document.getElementById('history-content');
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

    // Renderiza o gráfico de uso individual (Chart.js)
    renderChart(logs) {
        const ctx = document.getElementById('usageChart').getContext('2d');
        
        // Limpa a instância anterior do gráfico para evitar sobreposição/erros
        if (myChart instanceof Chart) {
            myChart.destroy();
        }

        // Agrupa saídas por dia
        const dailyUsage = {};
        logs.forEach(l => {
            if (l.type === 'SAIDA' && l.timestamp) {
                const dateStr = l.timestamp.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                dailyUsage[dateStr] = (dailyUsage[dateStr] || 0) + l.qty;
            }
        });

        // Prepara dados para o gráfico (ordem cronológica)
        const labels = Object.keys(dailyUsage).reverse();
        const dataPoints = Object.values(dailyUsage).reverse();

        // Configuração do Chart.js
        myChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Quantidade Retirada',
                    data: dataPoints,
                    backgroundColor: '#4f46e5', // Cor primária (Índigo)
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

    // Renderiza o widget de calendário
    renderCalendar() {
        const grid = document.getElementById('calendar-root');
        // Cabeçalho do calendário com controles de mês
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

        // Atualiza o título do mês
        document.getElementById('cal-title').innerText = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(calendarDate).toUpperCase();

        const firstDayOfWeek = new Date(year, month, 1).getDay();
        const lastDateOfMonth = new Date(year, month + 1, 0).getDate();
        const calDaysContainer = document.getElementById('cal-days');

        // Adiciona células vazias para o alinhamento do primeiro dia
        for (let i = 0; i < firstDayOfWeek; i++) {
            calDaysContainer.innerHTML += `<div></div>`;
        }

        // Gera os dias do mês
        for (let d = 1; d <= lastDateOfMonth; d++) {
            const dateStr = new Date(year, month, d).toLocaleDateString('pt-BR');
            // Verifica se houve movimentação neste dia
            const hasUsage = currentViewedLogs.some(l => l.timestamp && l.timestamp.toDate().toLocaleDateString('pt-BR') === dateStr);
            
            // Cria o elemento do dia, adicionando classe 'has-usage' e evento de clique se houver logs
            calDaysContainer.innerHTML += `
                <div class="cal-day ${hasUsage ? 'has-usage' : ''}" 
                     ${hasUsage ? `onclick="app.filterByDay(${d}, ${month}, ${year}, this)"` : ''}>
                    ${d}
                </div>
            `;
        }
    },

    // Altera o mês do calendário
    changeMonth(dir) {
        calendarDate.setMonth(calendarDate.getMonth() + dir);
        this.renderCalendar();
    },

    /* ================= FUNÇÕES DA ABA COMPRAS (PREDIÇÃO) ================= */

    // Calcula e renderiza a lista de predição de compras
    async renderShoppingList(items) {
        // Define o período de análise (últimos 15 dias)
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() - 15);

        // Busca o histórico de saídas no período
        const historySnap = await db.collection('historico')
            .where('type', '==', 'SAIDA')
            .where('timestamp', '>=', limitDate)
            .get();

        // Mapa para somar o uso total por produto
        const usageMap = {};
        historySnap.forEach(doc => {
            const data = doc.data();
            usageMap[data.productId] = (usageMap[data.productId] || 0) + Number(data.qty);
        });

        const tbody = document.getElementById('shopping-list');
        if (items.length === 0) {
            tbody.innerHTML = "<tr><td colspan='5' class='text-center'>Nenhum dado para análise.</td></tr>";
            return;
        }

        // Gera as linhas da tabela com os cálculos preditivos
        tbody.innerHTML = items.map(i => {
            const totalUsage15d = usageMap[i.id] || 0;
            const dailyAvg = totalUsage15d / 15; // Média diária simples
            const currentStock = Number(i.qty) || 0;

            // Calcula dias restantes estimados (evita divisão por zero)
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
                    // Define crítico se durar 5 dias ou menos
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

    /* ================= FUNÇÕES DA ABA GESTÃO (ADMIN) ================= */

    // Renderiza a contagem regressiva e botões de ação manual para alertas
    renderAlertCountdown() {
        const tbody = document.getElementById('alert-countdown-list');
        // Filtra itens com estoque baixo ou zerado
        const lowStockItems = fullInventory.filter(i => Number(i.qty) <= Number(i.minThreshold));

        if (lowStockItems.length === 0) {
            tbody.innerHTML = "<tr><td colspan='3' style='text-align:center; padding: 20px; color: var(--success); font-weight:700;'>✅ Todos os níveis de estoque estão saudáveis.</td></tr>";
            return;
        }

        const now = new Date();
        tbody.innerHTML = lowStockItems.map(i => {
            // Data em que o estoque ficou baixo (ou agora, se não houver registro)
            const lowSinceDate = i.lowStockSince ? i.lowStockSince.toDate() : now;
            // Calcula dias em estado crítico
            const daysInAlert = Math.floor((now - lowSinceDate) / (24 * 60 * 60 * 1000));
            
            // Verifica se já foi enviado alerta manual nesta sessão
            const hasSentInSession = sessionManualAlerts[i.id] ? " ✅ Enviado" : "";
            // Desabilita o botão se já enviado na sessão
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

    // Envia alerta manual via EmailJS
    async sendManualAlert(id, prodName, qty, min) {
        if (!alertConfig.email) return alert("Por favor, configure um e-mail destinatário primeiro.");
        
        const btn = document.activeElement;
        const originalText = btn.innerText;
        btn.innerText = "Enviando...";
        btn.disabled = true;

        try {
            await this.sendEmailAlert(prodName, qty, min, "Disparo Manual via Painel de Gestão");
            sessionManualAlerts[id] = true; // Marca como enviado na sessão
            this.renderAlertCountdown(); // Atualiza a UI
            alert(`Alerta para ${prodName} enviado com sucesso!`);
        } catch (error) {
            alert("Erro ao enviar e-mail. Verifique o console.");
            btn.innerText = originalText;
            btn.disabled = false;
        }
    },

    // Verifica e envia alertas automáticos para itens baixos há mais de 10 dias
    async checkTenDayAlerts() {
        if (!alertConfig.email) return; // Não faz nada se não houver e-mail configurado

        const now = new Date();
        const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000; // 10 dias em milissegundos

        fullInventory.forEach(async (p) => {
            const currentQty = Number(p.qty);
            const minThreshold = Number(p.minThreshold);

            if (currentQty <= minThreshold) {
                // Produto está com estoque baixo
                if (!p.lowStockSince) {
                    // Se não tem data de início do alerta, define agora
                    await db.collection('produtos').doc(p.id).update({
                        lowStockSince: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    return;
                }

                // Verifica há quanto tempo está baixo
                const timeInAlert = now - p.lowStockSince.toDate();
                if (timeInAlert >= TEN_DAYS_MS) {
                    // Passou de 10 dias. Verifica quando foi o último alerta enviado.
                    const lastAlertDate = p.lastAlertSent ? p.lastAlertSent.toDate() : new Date(0); // Data zero se nunca enviou
                    const timeSinceLastEmail = now - lastAlertDate;

                    // Se nunca enviou OU se o último envio também foi há mais de 10 dias (ciclo de reenvio)
                    if (timeSinceLastEmail >= TEN_DAYS_MS) {
                        console.log(`Disparando alerta automático de 10 dias para: ${p.name}`);
                        this.sendEmailAlert(p.name, currentQty, minThreshold, "Alerta Automático (Ciclo de 10 dias)");
                        
                        // Atualiza a data do último envio para reiniciar o ciclo
                        await db.collection('produtos').doc(p.id).update({
                            lastAlertSent: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }
                }
            } else {
                // Produto recuperou o estoque. Limpa os marcadores de alerta.
                if (p.lowStockSince || p.lastAlertSent) {
                    await db.collection('produtos').doc(p.id).update({
                        lowStockSince: null,
                        lastAlertSent: null
                    });
                }
            }
        });
    },

    // Função genérica para envio de e-mail via EmailJS
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
            console.log(`E-mail enviado para ${prodName}`);
        } catch (error) {
            console.error("Falha no envio de e-mail:", error);
            throw error; // Propaga o erro para quem chamou
        }
    },

    // Salva o e-mail de configuração no Firestore
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

    // Renderiza o gráfico de saídas mensais na aba Gestão
    async showCategorySummaries() {
        const ctx = document.getElementById('adminChart15').getContext('2d');
        
        // Limpa gráfico anterior
        if (adminChart15 instanceof Chart) {
            adminChart15.destroy();
        }

        // Define período (últimos 15 dias)
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() - 15);

        // Busca histórico de saídas
        const historySnap = await db.collection('historico')
            .where('type', '==', 'SAIDA')
            .where('timestamp', '>=', limitDate)
            .get();

        // Agrupa totais por categoria
        const categoryTotals = {};
        historySnap.forEach(doc => {
            const data = doc.data();
            if (data.category) {
                categoryTotals[data.category] = (categoryTotals[data.category] || 0) + data.qty;
            }
        });

        // Se não houver dados, mostra mensagem no canvas (opcional, aqui deixarei vazio)
        if (Object.keys(categoryTotals).length === 0) return;

        // Configura o gráfico Chart.js
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

    /* ================= FUNÇÕES DE CATEGORIAS ================= */

    // Adiciona nova categoria
    async addCategory() {
        const name = document.getElementById('new-cat-name').value.trim();
        if (!name) return alert("Digite um nome para a categoria.");
        
        // Verifica duplicidade localmente
        if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            return alert("Esta categoria já existe.");
        }

        await db.collection('categorias').add({ name: name });
        document.getElementById('new-cat-name').value = "";
    },

    // Deleta categoria (com confirmação)
    async deleteCategory(id) {
        if (confirm("Tem certeza? Isso não excluirá os produtos, apenas a categoria da lista.")) {
            await db.collection('categorias').doc(id).delete();
        }
    },

    // Renderiza a lista de categorias no modal
    renderCategoriesList() {
        const tbody = document.getElementById('categories-list');
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

    // Popula o select de categorias nos formulários de produto
    populateCategorySelect() {
        const select = document.getElementById('p-category');
        select.innerHTML = `<option value="">Selecione uma categoria...</option>` + 
            categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    },

    /* ================= FUNÇÕES UTILITÁRIAS E EXPORTAÇÃO ================= */

    // Exporta o estoque atual para CSV
    exportCSV() {
        if (fullInventory.length === 0) return alert("Nada para exportar.");
        
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "ID do Produto,Nome,Categoria,Saldo Atual,Estoque Minimo,Status\n";
        
        fullInventory.forEach(p => {
            const status = Number(p.qty) <= Number(p.minThreshold) ? "CRITICO" : "OK";
            // Escpa aspas duplas e adiciona aspas para lidar com vírgulas nos nomes
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

    // Gera relatório PDF simples do estoque
    generatePDF() {
        if (fullInventory.length === 0) return alert("Nada para gerar PDF.");

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

        const template = document.getElementById('pdf-template');
        template.innerHTML = htmlContent;
        template.style.display = 'block'; // Mostra temporariamente para o html2pdf

        const opt = {
            margin: 10,
            filename: `Relatorio_Estoque_SEMOBI_${new Date().getTime()}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        html2pdf().from(template).set(opt).save().then(() => {
            template.style.display = 'none'; // Esconde novamente
            template.innerHTML = '';
        });
    },

    // Carrega os logs de auditoria
    async loadAuditLogs() {
        ui.openModal('audit');
        const tbody = document.getElementById('audit-list');
        tbody.innerHTML = "<tr><td colspan='4' class='text-center'>Carregando registros...</td></tr>";

        try {
            const snap = await db.collection('historico')
                .orderBy('timestamp', 'desc')
                .limit(50) // Limita aos últimos 50 registros para performance
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

// Objeto de Controle de Interface (UI)
const ui = {
    // Alterna entre as abas (views)
    switchView(v) {
        // Esconde todas as seções
        document.querySelectorAll('.view-sec').forEach(s => s.classList.add('hidden'));
        // Remove estado ativo de todos os botões
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        
        // Mostra a seção selecionada e ativa o botão correspondente
        document.getElementById('view-' + v).classList.remove('hidden');
        document.getElementById('tab-' + v).classList.add('active');
        
        // Ações específicas ao entrar em uma aba
        if (v === 'admin') {
            app.showCategorySummaries(); // Atualiza gráfico se for a aba Gestão
        }
        window.scrollTo(0, 0); // Rola para o topo
    },

    // Abre um modal pelo seu ID sufixo
    openModal(m) {
        document.getElementById('modal-' + m).classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Previne rolagem da página de fundo
    },

    // Fecha um modal pelo seu ID sufixo
    closeModal(m) {
        document.getElementById('modal-' + m).classList.add('hidden');
        document.body.style.overflow = ''; // Restaura rolagem
    },

    // Alterna entre modo claro e escuro
    toggleDarkMode() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        // Opcional: Salvar preferência no localStorage
        localStorage.setItem('theme', newTheme);
    }
};

// Event Listeners Globais para submissão de formulários
document.getElementById('form-move').addEventListener('submit', app.processMove);
document.getElementById('form-product').addEventListener('submit', app.handleProductSubmit);

// Verifica preferência de tema salva ao iniciar
if (localStorage.getItem('theme') === 'dark') {
    ui.toggleDarkMode();
}
