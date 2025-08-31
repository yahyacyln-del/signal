// TradingView Alarm Relay Server - Dashboard JavaScript

class Dashboard {
    constructor() {
        this.isOnline = false;
        this.currentPage = 0;
        this.pageSize = 20;
        this.refreshInterval = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setWebhookUrl();
        this.startAutoRefresh();
        this.loadInitialData();
    }

    setupEventListeners() {
        // Tab change events
        document.querySelectorAll('#mainTabs button[data-bs-toggle="tab"]').forEach(tab => {
            tab.addEventListener('shown.bs.tab', (event) => {
                const target = event.target.getAttribute('data-bs-target');
                if (target === '#logs') {
                    this.loadLogs();
                } else if (target === '#config') {
                    this.loadConfig();
                }
            });
        });

        // Auto-refresh checkbox
        const autoRefreshCheckbox = document.getElementById('auto-refresh');
        if (autoRefreshCheckbox) {
            autoRefreshCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.startAutoRefresh();
                } else {
                    this.stopAutoRefresh();
                }
            });
        }
    }

    setWebhookUrl() {
        const webhookUrl = `${window.location.origin}/webhook/tradingview`;
        const urlInput = document.getElementById('webhook-url');
        if (urlInput) {
            urlInput.value = webhookUrl;
        }
    }

    startAutoRefresh() {
        this.stopAutoRefresh();
        this.refreshInterval = setInterval(() => {
            this.loadStats();
            this.loadAlarms();
        }, 30000); // Refresh every 30 seconds
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    async loadInitialData() {
        await this.loadStats();
        await this.loadAlarms();
        await this.testConnections();
    }

    async loadStats() {
        try {
            const response = await fetch('/api/stats');
            const result = await response.json();
            
            if (result.success) {
                this.updateStatsDisplay(result.data);
                this.updateServiceStatus(result.data.services);
                this.setOnlineStatus(true);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
            this.setOnlineStatus(false);
            this.showToast('İstatistikler yüklenemedi: ' + error.message, 'error');
        }
    }

    updateStatsDisplay(data) {
        // Update main statistics
        document.getElementById('total-alarms').textContent = data.total || 0;
        document.getElementById('last24h-alarms').textContent = data.last24h || 0;
        document.getElementById('successful-alarms').textContent = data.status?.successful || 0;
        
        // Update uptime
        const uptime = this.formatUptime(data.uptime || 0);
        document.getElementById('uptime').textContent = uptime;

        // Update delivery statistics
        if (data.delivery) {
            document.getElementById('telegram-sent').textContent = data.delivery.telegram?.attempted || 0;
            document.getElementById('telegram-success').textContent = data.delivery.telegram?.successful || 0;
            document.getElementById('whatsapp-sent').textContent = data.delivery.whatsapp?.attempted || 0;
            document.getElementById('whatsapp-success').textContent = data.delivery.whatsapp?.successful || 0;
        }
    }

    updateServiceStatus(services) {
        // Update Telegram status
        const telegramStatus = document.getElementById('telegram-status').querySelector('.badge');
        if (services.telegram?.configured && services.telegram?.enabled) {
            telegramStatus.className = 'badge bg-success';
            telegramStatus.innerHTML = '<i class="fas fa-check"></i> Aktif';
        } else if (services.telegram?.enabled) {
            telegramStatus.className = 'badge bg-warning';
            telegramStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Yapılandırılmamış';
        } else {
            telegramStatus.className = 'badge bg-secondary';
            telegramStatus.innerHTML = '<i class="fas fa-times"></i> Devre Dışı';
        }

        // Update WhatsApp status
        const whatsappStatus = document.getElementById('whatsapp-status').querySelector('.badge');
        if (services.whatsapp?.configured && services.whatsapp?.enabled) {
            whatsappStatus.className = 'badge bg-success';
            whatsappStatus.innerHTML = '<i class="fas fa-check"></i> Aktif';
        } else if (services.whatsapp?.enabled) {
            whatsappStatus.className = 'badge bg-warning';
            whatsappStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Yapılandırılmamış';
        } else {
            whatsappStatus.className = 'badge bg-secondary';
            whatsappStatus.innerHTML = '<i class="fas fa-times"></i> Devre Dışı';
        }
    }

    setOnlineStatus(online) {
        this.isOnline = online;
        const indicator = document.getElementById('status-indicator');
        
        if (online) {
            indicator.className = 'badge bg-success online';
            indicator.innerHTML = '<i class="fas fa-circle"></i> Çevrimiçi';
        } else {
            indicator.className = 'badge bg-danger offline';
            indicator.innerHTML = '<i class="fas fa-circle"></i> Çevrimdışı';
        }
    }

    async loadAlarms(page = 0) {
        try {
            const response = await fetch(`/api/alarms?limit=${this.pageSize}&offset=${page * this.pageSize}`);
            const result = await response.json();
            
            if (result.success) {
                this.displayAlarms(result.data.alarms);
                this.updatePagination(result.data, page);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Failed to load alarms:', error);
            this.showToast('Alarmlar yüklenemedi: ' + error.message, 'error');
            document.getElementById('alarms-table').innerHTML = 
                '<tr><td colspan="6" class="text-center text-danger">Alarmlar yüklenemedi</td></tr>';
        }
    }

    displayAlarms(alarms) {
        const tbody = document.getElementById('alarms-table');
        
        if (!alarms || alarms.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Henüz alarm bulunmuyor</td></tr>';
            return;
        }

        tbody.innerHTML = alarms.map(alarm => {
            const timestamp = new Date(alarm.timestamp).toLocaleString('tr-TR');
            const symbol = alarm.data.symbol || '-';
            const message = this.truncateText(alarm.data.message || '-', 50);
            
            const telegramBadge = this.getDeliveryBadge(alarm.delivery.telegram);
            const whatsappBadge = this.getDeliveryBadge(alarm.delivery.whatsapp);
            const statusBadge = this.getStatusBadge(alarm.status);
            
            return `
                <tr>
                    <td class="timestamp">${timestamp}</td>
                    <td><strong>${symbol}</strong></td>
                    <td title="${alarm.data.message || ''}">${message}</td>
                    <td>${telegramBadge}</td>
                    <td>${whatsappBadge}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        }).join('');
    }

    getDeliveryBadge(delivery) {
        if (!delivery.attempted) {
            return '<span class="badge bg-secondary">-</span>';
        }
        
        if (delivery.success) {
            return '<span class="badge bg-success"><i class="fas fa-check"></i></span>';
        } else {
            return '<span class="badge bg-danger" title="' + (delivery.error || 'Başarısız') + '"><i class="fas fa-times"></i></span>';
        }
    }

    getStatusBadge(status) {
        const badges = {
            success: '<span class="badge bg-success">Başarılı</span>',
            failed: '<span class="badge bg-danger">Başarısız</span>',
            partial: '<span class="badge bg-warning">Kısmi</span>',
            pending: '<span class="badge bg-secondary">Bekliyor</span>'
        };
        
        return badges[status] || '<span class="badge bg-secondary">Bilinmiyor</span>';
    }

    updatePagination(data, currentPage) {
        const container = document.getElementById('pagination-container');
        const pagination = document.getElementById('pagination');
        
        if (data.total <= this.pageSize) {
            container.classList.add('d-none');
            return;
        }
        
        container.classList.remove('d-none');
        const totalPages = Math.ceil(data.total / this.pageSize);
        
        let paginationHtml = '';
        
        // Previous button
        paginationHtml += `
            <li class="page-item ${currentPage === 0 ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="dashboard.loadAlarms(${currentPage - 1})">
                    <i class="fas fa-chevron-left"></i>
                </a>
            </li>
        `;
        
        // Page numbers
        for (let i = 0; i < totalPages; i++) {
            if (i === currentPage || i < 2 || i >= totalPages - 2 || Math.abs(i - currentPage) <= 1) {
                paginationHtml += `
                    <li class="page-item ${i === currentPage ? 'active' : ''}">
                        <a class="page-link" href="#" onclick="dashboard.loadAlarms(${i})">${i + 1}</a>
                    </li>
                `;
            } else if (i === 2 || i === totalPages - 3) {
                paginationHtml += '<li class="page-item disabled"><span class="page-link">...</span></li>';
            }
        }
        
        // Next button
        paginationHtml += `
            <li class="page-item ${currentPage >= totalPages - 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="dashboard.loadAlarms(${currentPage + 1})">
                    <i class="fas fa-chevron-right"></i>
                </a>
            </li>
        `;
        
        pagination.innerHTML = paginationHtml;
    }

    async testConnections() {
        try {
            const response = await fetch('/api/test-connections', { method: 'POST' });
            const result = await response.json();
            
            if (result.success) {
                // Connection test results are handled by updateServiceStatus
                // which is called from loadStats
            }
        } catch (error) {
            console.error('Connection test failed:', error);
        }
    }

    async loadLogs() {
        try {
            const response = await fetch('/api/logs?lines=200');
            const result = await response.json();
            
            if (result.success) {
                this.displayLogs(result.data);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Failed to load logs:', error);
            document.getElementById('logs-content').textContent = 'Loglar yüklenemedi: ' + error.message;
        }
    }

    displayLogs(logs) {
        const logsContent = document.getElementById('logs-content');
        
        if (!logs || logs.length === 0) {
            logsContent.textContent = 'Log bulunamadı.';
            return;
        }
        
        const logsText = logs.map(log => {
            const timestamp = log.timestamp || new Date().toISOString();
            const level = (log.level || 'info').toUpperCase().padEnd(5);
            return `[${timestamp}] [${level}] ${log.message}`;
        }).join('\n');
        
        logsContent.textContent = logsText;
        logsContent.scrollTop = logsContent.scrollHeight;
    }

    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            const result = await response.json();
            
            if (result.success) {
                this.displayConfig(result.data);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Failed to load config:', error);
            document.getElementById('config-content').innerHTML = 
                '<div class="alert alert-danger">Konfigürasyon yüklenemedi: ' + error.message + '</div>';
        }
    }

    displayConfig(config) {
        const configContent = document.getElementById('config-content');
        
        let html = '';
        
        // Server configuration
        html += `
            <div class="config-section">
                <h6><i class="fas fa-server"></i> Server Konfigürasyonu</h6>
                <div class="config-item">
                    <span class="config-label">Host:</span>
                    <span class="config-value">${config.server?.host || 'N/A'}</span>
                </div>
                <div class="config-item">
                    <span class="config-label">Port:</span>
                    <span class="config-value">${config.server?.port || 'N/A'}</span>
                </div>
            </div>
        `;
        
        // Telegram configuration
        html += `
            <div class="config-section">
                <h6><i class="fab fa-telegram"></i> Telegram Konfigürasyonu</h6>
                <div class="config-item">
                    <span class="config-label">Aktif:</span>
                    <span class="config-value">${config.telegram?.enabled ? 'Evet' : 'Hayır'}</span>
                </div>
                <div class="config-item">
                    <span class="config-label">Yapılandırılmış:</span>
                    <span class="config-value">${config.telegram?.configured ? 'Evet' : 'Hayır'}</span>
                </div>
            </div>
        `;
        
        // WhatsApp configuration
        html += `
            <div class="config-section">
                <h6><i class="fab fa-whatsapp"></i> WhatsApp Konfigürasyonu</h6>
                <div class="config-item">
                    <span class="config-label">Aktif:</span>
                    <span class="config-value">${config.whatsapp?.enabled ? 'Evet' : 'Hayır'}</span>
                </div>
                <div class="config-item">
                    <span class="config-label">Yapılandırılmış:</span>
                    <span class="config-value">${config.whatsapp?.configured ? 'Evet' : 'Hayır'}</span>
                </div>
            </div>
        `;
        
        // Storage configuration
        html += `
            <div class="config-section">
                <h6><i class="fas fa-database"></i> Depolama Konfigürasyonu</h6>
                <div class="config-item">
                    <span class="config-label">Maksimum Alarm:</span>
                    <span class="config-value">${config.storage?.maxAlarms || 'N/A'}</span>
                </div>
                <div class="config-item">
                    <span class="config-label">Veri Dizini:</span>
                    <span class="config-value">${config.storage?.dataPath || 'N/A'}</span>
                </div>
            </div>
        `;
        
        // Retry configuration
        html += `
            <div class="config-section">
                <h6><i class="fas fa-redo"></i> Yeniden Deneme Konfigürasyonu</h6>
                <div class="config-item">
                    <span class="config-label">Maksimum Deneme:</span>
                    <span class="config-value">${config.retry?.maxAttempts || 'N/A'}</span>
                </div>
                <div class="config-item">
                    <span class="config-label">Gecikme (ms):</span>
                    <span class="config-value">${config.retry?.delayMs || 'N/A'}</span>
                </div>
                <div class="config-item">
                    <span class="config-label">Exponential Backoff:</span>
                    <span class="config-value">${config.retry?.exponentialBackoff ? 'Evet' : 'Hayır'}</span>
                </div>
            </div>
        `;
        
        configContent.innerHTML = html;
    }

    formatUptime(seconds) {
        const days = Math.floor(seconds / (24 * 60 * 60));
        const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
        const minutes = Math.floor((seconds % (60 * 60)) / 60);
        
        if (days > 0) {
            return `${days}g ${hours}s`;
        } else if (hours > 0) {
            return `${hours}s ${minutes}d`;
        } else {
            return `${minutes}d`;
        }
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        const toastBody = document.getElementById('toast-body');
        
        // Set toast color based on type
        toast.className = 'toast';
        if (type === 'error') {
            toast.classList.add('border-danger');
        } else if (type === 'success') {
            toast.classList.add('border-success');
        } else if (type === 'warning') {
            toast.classList.add('border-warning');
        }
        
        toastBody.textContent = message;
        
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();
    }

    setButtonLoading(button, loading) {
        if (loading) {
            button.classList.add('loading');
            button.disabled = true;
        } else {
            button.classList.remove('loading');
            button.disabled = false;
        }
    }
}

// Global functions for HTML onclick handlers
async function testConnection(service) {
    const button = event.target.closest('button');
    dashboard.setButtonLoading(button, true);
    
    try {
        const response = await fetch('/api/test-connections', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            const serviceResult = result.data[service];
            if (serviceResult.success) {
                dashboard.showToast(`${service.charAt(0).toUpperCase() + service.slice(1)} bağlantısı başarılı!`, 'success');
            } else {
                dashboard.showToast(`${service.charAt(0).toUpperCase() + service.slice(1)} bağlantısı başarısız: ${serviceResult.error}`, 'error');
            }
        } else {
            dashboard.showToast('Bağlantı testi başarısız: ' + result.error, 'error');
        }
    } catch (error) {
        dashboard.showToast('Bağlantı testi başarısız: ' + error.message, 'error');
    } finally {
        dashboard.setButtonLoading(button, false);
    }
}

async function sendTestMessage() {
    const button = event.target;
    const service = document.getElementById('test-service').value;
    const message = document.getElementById('test-message').value;
    
    if (!message.trim()) {
        dashboard.showToast('Lütfen bir mesaj girin', 'warning');
        return;
    }
    
    dashboard.setButtonLoading(button, true);
    
    try {
        const response = await fetch('/api/test-message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ service, message })
        });
        
        const result = await response.json();
        
        if (result.success) {
            dashboard.showToast('Test mesajı başarıyla gönderildi!', 'success');
            document.getElementById('test-result').innerHTML = `
                <div class="alert alert-success">
                    <strong>Başarılı!</strong> Test mesajı ${service} üzerinden gönderildi.
                </div>
            `;
        } else {
            dashboard.showToast('Test mesajı gönderilemedi: ' + result.error, 'error');
            document.getElementById('test-result').innerHTML = `
                <div class="alert alert-danger">
                    <strong>Hata!</strong> ${result.error}
                </div>
            `;
        }
    } catch (error) {
        dashboard.showToast('Test mesajı gönderilemedi: ' + error.message, 'error');
        document.getElementById('test-result').innerHTML = `
            <div class="alert alert-danger">
                <strong>Hata!</strong> ${error.message}
            </div>
        `;
    } finally {
        dashboard.setButtonLoading(button, false);
    }
}

async function sendTestWebhook() {
    const button = event.target;
    dashboard.setButtonLoading(button, true);
    
    try {
        const testData = {
            symbol: 'BTCUSDT',
            price: '50000',
            message: 'Test webhook from dashboard',
            strategy: 'Test Strategy',
            timeframe: '1h',
            timestamp: new Date().toISOString()
        };
        
        const response = await fetch('/webhook/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: testData })
        });
        
        const result = await response.json();
        
        if (result.success) {
            dashboard.showToast('Test webhook başarıyla gönderildi!', 'success');
            document.getElementById('test-result').innerHTML = `
                <div class="alert alert-success">
                    <strong>Başarılı!</strong> Test webhook gönderildi ve işlendi.
                    <br><small>Alarm ID: ${result.alarmId}</small>
                </div>
            `;
            // Refresh alarms to show the new test alarm
            dashboard.loadAlarms();
        } else {
            dashboard.showToast('Test webhook başarısız: ' + result.error, 'error');
            document.getElementById('test-result').innerHTML = `
                <div class="alert alert-warning">
                    <strong>Kısmi Başarı</strong> Test webhook gönderildi ancak bazı servisler başarısız oldu.
                    <br><small>Alarm ID: ${result.alarmId || 'N/A'}</small>
                </div>
            `;
        }
    } catch (error) {
        dashboard.showToast('Test webhook başarısız: ' + error.message, 'error');
        document.getElementById('test-result').innerHTML = `
            <div class="alert alert-danger">
                <strong>Hata!</strong> ${error.message}
            </div>
        `;
    } finally {
        dashboard.setButtonLoading(button, false);
    }
}

function copyWebhookUrl() {
    const urlInput = document.getElementById('webhook-url');
    urlInput.select();
    urlInput.setSelectionRange(0, 99999);
    
    try {
        document.execCommand('copy');
        dashboard.showToast('Webhook URL kopyalandı!', 'success');
    } catch (error) {
        dashboard.showToast('URL kopyalanamadı', 'error');
    }
}

function loadAlarms() {
    dashboard.loadAlarms();
}

function loadLogs() {
    dashboard.loadLogs();
}

// Initialize dashboard when page loads
const dashboard = new Dashboard();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    dashboard.stopAutoRefresh();
});
