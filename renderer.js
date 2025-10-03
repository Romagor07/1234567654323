const { ipcRenderer } = require('electron');

class ServerMonitor {
    constructor() {
        this.servers = [];
        this.serverHistories = new Map();
        this.darkTheme = false;
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadServers();
        this.startAutoRefresh();
        console.log('🚀 Запуск мониторинга серверов v3.2...');
    }

    setupEventListeners() {
        document.getElementById('minimizeBtn').addEventListener('click', () => {
            ipcRenderer.invoke('minimize-window');
        });

        document.getElementById('closeBtn').addEventListener('click', () => {
            ipcRenderer.invoke('close-window');
        });

        document.getElementById('themeBtn').addEventListener('click', () => {
            this.toggleTheme();
        });

        document.getElementById('addBtn').addEventListener('click', () => {
            this.showAddServerModal();
        });

        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshAllServers();
        });

        document.getElementById('cancelAdd').addEventListener('click', () => {
            this.hideAddServerModal();
        });

        document.getElementById('confirmAdd').addEventListener('click', () => {
            this.addServer();
        });

        document.getElementById('addServerModal').addEventListener('click', (e) => {
            if (e.target.id === 'addServerModal') {
                this.hideAddServerModal();
            }
        });
    }

    toggleTheme() {
        this.darkTheme = !this.darkTheme;
        const app = document.getElementById('app');
        const themeBtn = document.getElementById('themeBtn');
        
        if (this.darkTheme) {
            app.classList.add('dark-theme');
            app.classList.remove('light-theme');
            themeBtn.textContent = '🌞';
        } else {
            app.classList.add('light-theme');
            app.classList.remove('dark-theme');
            themeBtn.textContent = '🌙';
        }
        
        this.updateServerWidgetsTheme();
        this.redrawAllCharts();
    }

    updateServerWidgetsTheme() {
        document.querySelectorAll('.server-widget').forEach(widget => {
            if (this.darkTheme) {
                widget.classList.add('dark-theme');
            } else {
                widget.classList.remove('dark-theme');
            }
        });
    }

    showAddServerModal() {
        document.getElementById('addServerModal').style.display = 'flex';
        document.getElementById('serverIp').focus();
    }

    hideAddServerModal() {
        document.getElementById('addServerModal').style.display = 'none';
        document.getElementById('serverIp').value = '';
        document.getElementById('serverPort').value = '25565';
    }

    async addServer() {
        const ip = document.getElementById('serverIp').value.trim();
        const port = parseInt(document.getElementById('serverPort').value);

        if (!ip) {
            this.showMessage('Ошибка', 'Введите IP адрес сервера');
            return;
        }

        if (isNaN(port) || port < 1 || port > 65535) {
            this.showMessage('Ошибка', 'Введите корректный порт (1-65535)');
            return;
        }

        const serverName = this.getServerName(ip, port);
        const serverData = { ip, port, name: serverName };

        this.servers.push(serverData);
        this.serverHistories.set(this.getServerKey(serverData), []);
        this.createServerWidget(serverData);
        await this.saveServers();
        this.hideAddServerModal();
    }

    getServerKey(serverData) {
        return `${serverData.ip}:${serverData.port}`;
    }

    getServerName(ip, port) {
        const gameTypes = {
            27015: "Garry's Mod", 25565: "Minecraft",
            7777: "SCP:SL", 80: "Web Server", 
            443: "Web Server (HTTPS)", 27005: "CS:GO",
            2302: "Arma 3", 2456: "Valheim",
            16261: "Rust", 22125: "7 Days to Die"
        };
        const gameName = gameTypes[port] || `Сервер ${port}`;
        return `${gameName} - ${ip}`;
    }

    createServerWidget(serverData) {
        const serversList = document.getElementById('serversList');
        const widget = document.createElement('div');
        widget.className = `server-widget ${this.darkTheme ? 'dark-theme' : ''}`;
        widget.setAttribute('data-server-key', this.getServerKey(serverData));
        
        widget.innerHTML = `
            <div class="server-header">
                <div class="status-indicator">●</div>
                <div class="server-info">
                    <div class="server-name">${serverData.name}</div>
                    <div class="server-status">Проверка...</div>
                </div>
                <div class="server-online">-/-</div>
                <button class="delete-btn" title="Удалить сервер">🗑️</button>
            </div>
            <div class="server-details">
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-icon">👥</span>
                        <span class="stat-value">Игроков: -/-</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-icon">📶</span>
                        <span class="stat-value">Пинг: - мс</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-icon">🕐</span>
                        <span class="stat-value">Проверка: -</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-icon">🎮</span>
                        <span class="stat-value">Игра: -</span>
                    </div>
                </div>
                
                <div class="online-history">
                    <div class="history-header">
                        <span>📊 История онлайна (последние 10 проверок):</span>
                    </div>
                    <div class="chart-container">
                        <canvas class="online-chart"></canvas>
                    </div>
                </div>
                
                <div class="players-section">
                    <div class="players-header">🎮 Игроки онлайн:</div>
                    <div class="players-list-container">
                        <div class="players-list">Загрузка данных...</div>
                    </div>
                </div>
            </div>
        `;

        const header = widget.querySelector('.server-header');
        header.addEventListener('click', (e) => {
            if (!e.target.classList.contains('delete-btn')) {
                this.toggleServerDetails(widget);
            }
        });

        widget.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteServer(widget, serverData);
        });

        serversList.appendChild(widget);
        this.checkServerStatus(widget, serverData);
    }

    async checkServerStatus(widget, serverData) {
        try {
            const status = await ipcRenderer.invoke('check-server', serverData);
            this.updateServerHistory(serverData, status);
            this.updateServerUI(widget, status);
        } catch (error) {
            console.error('Error checking server:', error);
        }
    }

    updateServerHistory(serverData, status) {
        const key = this.getServerKey(serverData);
        if (!this.serverHistories.has(key)) {
            this.serverHistories.set(key, []);
        }
        
        const history = this.serverHistories.get(key);
        history.push({
            timestamp: status.timestamp,
            players: status.players,
            ping: status.ping,
            online: status.online
        });
        
        if (history.length > 10) {
            history.shift();
        }
    }

    updateServerUI(widget, status) {
        const key = widget.getAttribute('data-server-key');
        const history = this.serverHistories.get(key) || [];
        
        const indicator = widget.querySelector('.status-indicator');
        const statusText = widget.querySelector('.server-status');
        const onlineText = widget.querySelector('.server-online');

        if (status.online) {
            indicator.className = 'status-indicator status-online';
            statusText.innerHTML = '<span style="color: #00aa00;">🟢 Онлайн</span>';
            onlineText.textContent = `${status.players}/${status.maxPlayers}`;
            onlineText.className = 'server-online online-online';
        } else {
            indicator.className = 'status-indicator status-offline';
            statusText.innerHTML = '<span style="color: #aa0000;">🔴 Оффлайн</span>';
            onlineText.textContent = '0/0';
            onlineText.className = 'server-online online-offline';
        }

        const details = widget.querySelector('.server-details');
        if (details.classList.contains('expanded')) {
            const stats = widget.querySelectorAll('.stat-value');
            stats[0].textContent = `Игроков: ${status.players}/${status.maxPlayers}`;
            stats[1].textContent = `Пинг: ${status.ping > 0 ? status.ping + ' мс' : 'N/A'}`;
            stats[2].textContent = `Проверка: ${status.timestamp}`;
            stats[3].textContent = `Игра: ${status.gameType}`;

            const playersList = widget.querySelector('.players-list');
            if (status.online) {
                playersList.innerHTML = '<div class="no-players">Сервер доступен (базовая проверка)</div>';
            } else {
                playersList.innerHTML = '<div class="no-players">Сервер недоступен</div>';
            }

            this.drawOnlineChart(widget, history);
        }
    }

    drawOnlineChart(widget, history) {
        const canvas = widget.querySelector('.online-chart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width = 300;
        const height = canvas.height = 80;
        const padding = 10;

        ctx.clearRect(0, 0, width, height);

        if (history.length < 2) {
            ctx.fillStyle = this.darkTheme ? '#666' : '#ccc';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Недостаточно данных', width / 2, height / 2);
            return;
        }

        const playersData = history.map(h => h.players);
        const maxPlayers = Math.max(...playersData, 10);
        const minPlayers = Math.min(...playersData);
        const lastStatus = history[history.length - 1];
        const isOnline = lastStatus ? lastStatus.online : false;

        ctx.strokeStyle = this.darkTheme ? '#444' : '#ddd';
        ctx.lineWidth = 0.5;
        
        for (let i = 0; i <= 4; i++) {
            const y = padding + (height - 2 * padding) * (1 - i / 4);
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.strokeStyle = isOnline ? '#00aa00' : '#aa0000';
        ctx.lineWidth = 2;

        playersData.forEach((players, index) => {
            const x = padding + (width - 2 * padding) * (index / (playersData.length - 1));
            const y = padding + (height - 2 * padding) * (1 - (players - minPlayers) / (maxPlayers - minPlayers || 1));
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();

        ctx.fillStyle = isOnline ? '#00ff00' : '#ff0000';
        playersData.forEach((players, index) => {
            const x = padding + (width - 2 * padding) * (index / (playersData.length - 1));
            const y = padding + (height - 2 * padding) * (1 - (players - minPlayers) / (maxPlayers - minPlayers || 1));
            
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, 2 * Math.PI);
            ctx.fill();
        });

        ctx.fillStyle = this.darkTheme ? '#fff' : '#000';
        ctx.font = '10px Arial';
        ctx.textAlign = 'left';
        
        if (maxPlayers > 0) {
            ctx.fillText(maxPlayers.toString(), width - padding + 5, padding + 5);
        }
        
        if (minPlayers >= 0) {
            ctx.fillText(minPlayers.toString(), width - padding + 5, height - padding - 5);
        }
    }

    redrawAllCharts() {
        document.querySelectorAll('.server-widget').forEach(widget => {
            const key = widget.getAttribute('data-server-key');
            const history = this.serverHistories.get(key) || [];
            if (widget.querySelector('.server-details').classList.contains('expanded')) {
                this.drawOnlineChart(widget, history);
            }
        });
    }

    toggleServerDetails(widget) {
        const details = widget.querySelector('.server-details');
        const wasExpanded = details.classList.contains('expanded');
        
        document.querySelectorAll('.server-details').forEach(d => {
            d.classList.remove('expanded');
            d.style.maxHeight = '0';
        });
        
        if (!wasExpanded) {
            details.classList.add('expanded');
            details.style.maxHeight = '500px';
            const key = widget.getAttribute('data-server-key');
            const history = this.serverHistories.get(key) || [];
            this.drawOnlineChart(widget, history);
        }
    }

    async deleteServer(widget, serverData) {
        const result = await ipcRenderer.invoke('show-dialog', {
            type: 'question',
            buttons: ['Да', 'Нет'],
            title: 'Удаление сервера',
            message: 'Вы уверены, что хотите удалить этот сервер?'
        });

        if (result === 0) {
            widget.remove();
            this.servers = this.servers.filter(s => 
                !(s.ip === serverData.ip && s.port === serverData.port)
            );
            this.serverHistories.delete(this.getServerKey(serverData));
            await this.saveServers();
        }
    }

    async loadServers() {
        this.servers = await ipcRenderer.invoke('load-servers');
        
        if (this.servers.length === 0) {
            this.servers = [
                { ip: 'google.com', port: 80, name: 'Google Web Server' },
                { ip: 'mc.hypixel.net', port: 25565, name: 'Hypixel Minecraft' },
                { ip: '95.165.168.5', port: 27015, name: 'Garry\'s Mod Server' }
            ];
        }

        this.servers.forEach(server => {
            this.serverHistories.set(this.getServerKey(server), []);
            this.createServerWidget(server);
        });
    }

    async saveServers() {
        await ipcRenderer.invoke('save-servers', this.servers);
    }

    async refreshAllServers() {
        const widgets = document.querySelectorAll('.server-widget');
        for (let i = 0; i < widgets.length; i++) {
            if (i < this.servers.length) {
                await this.checkServerStatus(widgets[i], this.servers[i]);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    }

    startAutoRefresh() {
        setInterval(() => {
            this.refreshAllServers();
        }, 30000);
    }

    showMessage(title, message) {
        const existingModal = document.querySelector('.message-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.className = 'message-modal';
        modal.innerHTML = `
            <div class="message-content">
                <h3>${title}</h3>
                <p>${message}</p>
                <button onclick="this.parentElement.parentElement.remove()">OK</button>
            </div>
        `;
        document.body.appendChild(modal);

        setTimeout(() => {
            if (modal.parentElement) {
                modal.remove();
            }
        }, 5000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ServerMonitor();
});