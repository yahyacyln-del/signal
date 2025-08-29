#!/usr/bin/env python3
from flask import Flask, request, jsonify, render_template_string
import requests
import json
import os
from datetime import datetime, timedelta
import logging
from twilio.rest import Client
import hashlib
import secrets
import time
import threading
from pathlib import Path

app = Flask(__name__)

# Enhanced logging system
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('paratoner.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Create logs directory
Path('logs').mkdir(exist_ok=True)
Path('backups').mkdir(exist_ok=True)

# Enhanced Storage
alarms = []
service_config = {
    'telegram': {'enabled': True, 'health': True, 'last_check': None, 'retry_count': 0},
    'whatsapp': {'enabled': False, 'health': True, 'last_check': None, 'retry_count': 0}
}

# Security System
ADMIN_PASSWORD_HASH = hashlib.sha256('ParatonerPro2025!'.encode()).hexdigest()
api_keys_config = {
    'telegram': {'token': '', 'chat_id': ''},
    'whatsapp': {'account_sid': '', 'auth_token': '', 'from_number': '', 'to_number': ''}
}

# System metrics
system_metrics = {
    'total_signals': 0,
    'success_rate': {'telegram': 0, 'whatsapp': 0},
    'average_delay': 0,
    'last_restart': datetime.now(),
    'uptime': 0
}

# Retry mechanism
retry_queue = []

# Enhanced Configuration with API Key Management
def load_api_keys():
    global api_keys_config
    # Load from environment first, then allow dashboard override
    api_keys_config['telegram']['token'] = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    api_keys_config['telegram']['chat_id'] = os.environ.get('TELEGRAM_CHAT_ID', '')
    api_keys_config['whatsapp']['account_sid'] = os.environ.get('TWILIO_ACCOUNT_SID', '')
    api_keys_config['whatsapp']['auth_token'] = os.environ.get('TWILIO_AUTH_TOKEN', '')
    api_keys_config['whatsapp']['from_number'] = os.environ.get('TWILIO_FROM_NUMBER', '')
    api_keys_config['whatsapp']['to_number'] = os.environ.get('TWILIO_TO_NUMBER', '')

load_api_keys()
WEBHOOK_URL = 'https://wtel.onrender.com/webhook/tradingview'

# Security functions
def verify_password(password):
    return hashlib.sha256(password.encode()).hexdigest() == ADMIN_PASSWORD_HASH

def log_system_event(event_type, message, level='INFO'):
    timestamp = datetime.now().strftime('%d.%m.%Y %H:%M:%S')
    
    # User-friendly log messages
    friendly_messages = {
        'TELEGRAM_SUCCESS': f'✅ Telegram mesajı başarıyla gönderildi: {message}',
        'WHATSAPP_SUCCESS': f'✅ WhatsApp mesajı başarıyla gönderildi: {message}',
        'TELEGRAM_ERROR': f'❌ Telegram hatası: {message}',
        'WHATSAPP_ERROR': f'❌ WhatsApp hatası: {message}',
        'API_KEYS_UPDATED': f'🔑 API anahtarları güncellendi',
        'DATA_EXPORT': f'💾 Veri yedeği oluşturuldu: {message}',
        'WEBHOOK_RECEIVED': f'📨 Yeni sinyal alındı: {message}',
        'SERVICE_TOGGLE': f'⚙️ Servis durumu değiştirildi: {message}'
    }
    
    friendly_msg = friendly_messages.get(event_type, f'ℹ️ {event_type}: {message}')
    log_entry = f"{timestamp} | {friendly_msg}"
    
    with open('logs/system.log', 'a', encoding='utf-8') as f:
        f.write(log_entry + '\n')
    
    if level == 'ERROR':
        logger.error(f"{event_type}: {message}")
    elif level == 'WARNING':
        logger.warning(f"{event_type}: {message}")
    else:
        logger.info(f"{event_type}: {message}")

def measure_latency(func):
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        latency = (end_time - start_time) * 1000  # Convert to milliseconds
        return result, latency
    return wrapper

def send_telegram_with_retry(message, max_retries=3):
    for attempt in range(max_retries):
        try:
            url = f'https://api.telegram.org/bot{api_keys_config["telegram"]["token"]}/sendMessage'
            payload = {'chat_id': api_keys_config['telegram']['chat_id'], 'text': message, 'parse_mode': 'HTML'}
            response = requests.post(url, json=payload, timeout=10)
            if response.status_code == 200:
                service_config['telegram']['health'] = True
                service_config['telegram']['retry_count'] = 0
                log_system_event('TELEGRAM_SUCCESS', f'1. deneme ile gönderildi' if attempt == 0 else f'{attempt + 1}. deneme ile gönderildi')
                return True
        except Exception as e:
            log_system_event('TELEGRAM_ERROR', f'{attempt + 1}. deneme başarısız: {str(e)[:100]}', 'ERROR')
            service_config['telegram']['retry_count'] += 1
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)  # Exponential backoff
    
    service_config['telegram']['health'] = False
    return False

def send_whatsapp_with_retry(message, max_retries=3):
    for attempt in range(max_retries):
        try:
            client = Client(api_keys_config['whatsapp']['account_sid'], api_keys_config['whatsapp']['auth_token'])
            message_obj = client.messages.create(
                body=message, 
                from_=f'whatsapp:{api_keys_config["whatsapp"]["from_number"]}', 
                to=f'whatsapp:{api_keys_config["whatsapp"]["to_number"]}'
            )
            if message_obj.sid:
                service_config['whatsapp']['health'] = True
                service_config['whatsapp']['retry_count'] = 0
                log_system_event('WHATSAPP_SUCCESS', f'1. deneme ile gönderildi' if attempt == 0 else f'{attempt + 1}. deneme ile gönderildi')
                return True
        except Exception as e:
            log_system_event('WHATSAPP_ERROR', f'{attempt + 1}. deneme başarısız: {str(e)[:100]}', 'ERROR')
            service_config['whatsapp']['retry_count'] += 1
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)  # Exponential backoff
    
    service_config['whatsapp']['health'] = False
    return False

# Enhanced messaging functions (keeping old names for compatibility)
def send_telegram_message(message):
    start_time = time.time()
    result = send_telegram_with_retry(message)
    latency = (time.time() - start_time) * 1000
    system_metrics['average_delay'] = (system_metrics.get('average_delay', 0) + latency) / 2
    return result

def send_whatsapp_message(message):
    start_time = time.time()
    result = send_whatsapp_with_retry(message)
    latency = (time.time() - start_time) * 1000
    system_metrics['average_delay'] = (system_metrics.get('average_delay', 0) + latency) / 2
    return result

@app.route('/')
def dashboard():
    password = request.args.get('password')
    
    if not password or not verify_password(password):
        return render_template_string('''
<!DOCTYPE html>
<html>
<head>
    <title>Paratoner Signal Pro - Giriş</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <style>
        body { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh; display: flex; align-items: center; justify-content: center;
        }
        .login-container {
            background: rgba(255,255,255,0.95); border-radius: 20px; 
            box-shadow: 0 15px 35px rgba(0,0,0,0.1); padding: 50px 40px; 
            text-align: center; max-width: 450px; width: 90%;
        }
        .logo { font-size: 4rem; background: linear-gradient(45deg, #667eea, #764ba2); 
                -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .login-btn { background: linear-gradient(45deg, #667eea, #764ba2); border: none; 
                     border-radius: 12px; padding: 15px 40px; color: white; width: 100%; }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="logo"><i class="fas fa-signal"></i></div>
        <h1>Paratoner Signal Pro</h1>
        <p>TradingView Webhook Sistemi</p>
        <form onsubmit="event.preventDefault(); window.location.href='/?password='+document.getElementById('pwd').value;">
            <input type="password" id="pwd" class="form-control mb-3" placeholder="Yönetici şifresi" required>
            <button type="submit" class="login-btn">Dashboard'a Giriş</button>
        </form>
    </div>
</body>
</html>
        ''')
    
    return render_template_string('''
<!DOCTYPE html>
<html>
<head>
    <title>Paratoner Signal Pro</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <style>
        body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        .dashboard-card { background: rgba(255,255,255,0.95); border-radius: 15px; 
                         box-shadow: 0 8px 32px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .btn-toggle-active { background: #28a745; color: white; border: none; padding: 8px 15px; 
                            border-radius: 5px; margin: 5px; }
        .btn-toggle-inactive { background: #dc3545; color: white; border: none; padding: 8px 15px; 
                              border-radius: 5px; margin: 5px; }
        .btn-test { background: #ffc107; color: #212529; border: none; padding: 8px 15px; 
                   border-radius: 5px; margin: 5px; }
        .btn-copy { background: #dc3545; color: white; border: none; padding: 8px 15px; 
                   border-radius: 5px; margin: 5px; }
    </style>
</head>
<body>
    <div class="container mt-4">
        <div class="text-center text-white mb-4">
            <h1><i class="fas fa-signal"></i> Paratoner Signal Pro</h1>
            <p>TradingView Webhook Sistemi</p>
        </div>
        
        <div class="row">
            <div class="col-md-6">
                <div class="dashboard-card p-4">
                    <h3><i class="fas fa-cogs"></i> Servis Kontrolleri</h3>
                    
                    <div class="mb-3">
                        <h5>📱 Telegram</h5>
                        <span id="telegram-status" class="badge bg-success">Aktif</span>
                        <div class="mt-2">
                            <button onclick="toggleService('telegram')" id="telegram-toggle-btn" class="btn-toggle-active">
                                <i class="fas fa-toggle-on"></i> Aktif
                            </button>
                            <button onclick="testService('telegram')" class="btn-test">
                                <i class="fas fa-vial"></i> Test Et
                            </button>
                        </div>
                    </div>
                    
                    <div class="mb-3">
                        <h5>💬 WhatsApp</h5>
                        <span id="whatsapp-status" class="badge bg-success">Aktif</span>
                        <div class="mt-2">
                            <button onclick="toggleService('whatsapp')" id="whatsapp-toggle-btn" class="btn-toggle-active">
                                <i class="fas fa-toggle-on"></i> Aktif
                            </button>
                            <button onclick="testService('whatsapp')" class="btn-test">
                                <i class="fas fa-vial"></i> Test Et
                            </button>
                        </div>
                    </div>
                    
                    <div class="mb-3">
                        <h5>🔗 Webhook URL</h5>
                        <div class="p-2 bg-light border rounded mb-2" style="font-size: 12px; word-break: break-all;">
                            {{ webhook_url }}
                        </div>
                        <button onclick="copyUrl()" class="btn-copy">
                            <i class="fas fa-copy"></i> URL Kopyala
                        </button>
                        <button onclick="testWebhook()" class="btn-test">
                            <i class="fas fa-rocket"></i> Webhook Test
                        </button>
                    </div>
                    
                    <div class="mb-3">
                        <h5>⚙️ Sistem Yönetimi</h5>
                        <div class="mt-2">
                            <button onclick="showApiKeyManager()" class="btn" style="background: #17a2b8; color: white; border: none; padding: 8px 15px; border-radius: 5px; margin: 5px;">
                                <i class="fas fa-key"></i> API Anahtarları
                            </button>
                            <button onclick="exportData()" class="btn" style="background: #6f42c1; color: white; border: none; padding: 8px 15px; border-radius: 5px; margin: 5px;">
                                <i class="fas fa-download"></i> Veri İndir
                            </button>
                            <button onclick="showSystemLogs()" class="btn" style="background: #fd7e14; color: white; border: none; padding: 8px 15px; border-radius: 5px; margin: 5px;">
                                <i class="fas fa-file-alt"></i> Sistem Logları
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="col-md-6">
                <div class="dashboard-card p-4">
                    <h3><i class="fas fa-history"></i> Son Sinyaller</h3>
                    <div id="recent-signals">
                        <div class="text-center p-3">
                            <i class="fas fa-spinner fa-spin"></i> Yükleniyor...
                        </div>
                    </div>
                    <button onclick="refreshSignals()" class="btn-copy">
                        <i class="fas fa-sync"></i> Yenile
                    </button>
                </div>
                
            </div>
        </div>
        
        <!-- API Key Manager Modal -->
        <div id="apiKeyModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000;">
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 30px; border-radius: 15px; width: 90%; max-width: 600px; max-height: 80%; overflow-y: auto;">
                <h3><i class="fas fa-key"></i> API Anahtar Yönetimi</h3>
                <div class="mb-4">
                    <div class="alert alert-info">
                        <h6><i class="fas fa-info-circle"></i> API Servisleri</h6>
                        <small><strong>Telegram:</strong> Bot Token ve Chat ID gerekli</small><br>
                        <small><strong>WhatsApp:</strong> Twilio hesap bilgileri gerekli</small>
                    </div>
                    
                    <h5><i class="fab fa-telegram"></i> Telegram Bot API</h5>
                    <input type="text" id="telegram-token" placeholder="Bot Token (@BotFather'dan alınır)" class="form-control mb-2">
                    <input type="text" id="telegram-chat-id" placeholder="Chat ID (numarik)" class="form-control mb-3">
                    
                    <h5><i class="fab fa-whatsapp"></i> WhatsApp (Twilio API)</h5>
                    <input type="text" id="twilio-sid" placeholder="Account SID (Twilio Console)" class="form-control mb-2">
                    <input type="password" id="twilio-token" placeholder="Auth Token (Twilio Console)" class="form-control mb-2">
                    <input type="text" id="twilio-from" placeholder="From Number (+14155238886)" class="form-control mb-2">
                    <input type="text" id="twilio-to" placeholder="To Number (+905XXXXXXXXX)" class="form-control mb-3">
                </div>
                <div class="text-end">
                    <button onclick="saveApiKeys()" class="btn btn-success me-2">
                        <i class="fas fa-save"></i> Kaydet
                    </button>
                    <button onclick="closeModal()" class="btn btn-secondary">
                        <i class="fas fa-times"></i> Kapat
                    </button>
                </div>
            </div>
        </div>
        
        <!-- System Logs Modal -->
        <div id="logsModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000;">
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 30px; border-radius: 15px; width: 90%; max-width: 800px; max-height: 80%; overflow-y: auto;">
                <h3><i class="fas fa-file-alt"></i> Sistem Logları</h3>
                <div id="system-logs-content" style="background: #f8f9fa; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 12px; max-height: 400px; overflow-y: auto;"></div>
                <div class="text-end mt-3">
                    <button onclick="refreshLogs()" class="btn btn-info me-2">
                        <i class="fas fa-sync"></i> Yenile
                    </button>
                    <button onclick="closeLogsModal()" class="btn btn-secondary">
                        <i class="fas fa-times"></i> Kapat
                    </button>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        // Notification system
        function showNotification(message, type) {
            const div = document.createElement('div');
            div.innerHTML = message;
            div.style.cssText = 'position: fixed; top: 20px; right: 20px; padding: 15px; border-radius: 5px; color: white; z-index: 9999; font-weight: bold; background: ' + (type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8') + ';';
            document.body.appendChild(div);
            setTimeout(function() { div.remove(); }, 3000);
        }
        
        // Copy URL
        function copyUrl() {
            navigator.clipboard.writeText('{{ webhook_url }}').then(function() {
                showNotification('URL kopyalandı!', 'success');
            }).catch(function() {
                showNotification('Kopyalama başarısız!', 'error');
            });
        }
        
        // Toggle service
        function toggleService(service) {
            showNotification('Servis durumu değiştiriliyor...', 'info');
            fetch('/admin/toggle-service', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({service: service, password: 'ParatonerPro2025!'})
            }).then(function(response) { return response.json(); })
            .then(function(data) {
                if (data.success) {
                    updateServiceStatus(service, data.enabled);
                    showNotification(data.message, 'success');
                } else {
                    showNotification('Güncelleme başarısız!', 'error');
                }
            }).catch(function() {
                showNotification('Bağlantı hatası!', 'error');
            });
        }
        
        // Update service status visual
        function updateServiceStatus(service, enabled) {
            const statusElement = document.getElementById(service + '-status');
            const toggleBtn = document.getElementById(service + '-toggle-btn');
            
            if (enabled) {
                statusElement.className = 'badge bg-success';
                statusElement.textContent = 'Aktif';
                toggleBtn.className = 'btn-toggle-active';
                toggleBtn.innerHTML = '<i class="fas fa-toggle-on"></i> Aktif';
            } else {
                statusElement.className = 'badge bg-danger';
                statusElement.textContent = 'Pasif';
                toggleBtn.className = 'btn-toggle-inactive';
                toggleBtn.innerHTML = '<i class="fas fa-toggle-off"></i> Pasif';
            }
        }
        
        // Test service
        function testService(service) {
            showNotification('Test mesajı gönderiliyor...', 'info');
            fetch('/admin/test-message', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    service: service, 
                    message: 'PARATONER BOT TEST - ' + new Date().toLocaleString('tr-TR'),
                    password: 'ParatonerPro2025!'
                })
            }).then(function(response) { return response.json(); })
            .then(function(data) {
                if (data.success) {
                    showNotification(service + ' test başarılı!', 'success');
                } else {
                    showNotification('Test başarısız!', 'error');
                }
            }).catch(function() {
                showNotification('Test hatası!', 'error');
            });
        }
        
        // Test webhook
        function testWebhook() {
            showNotification('Webhook test gönderiliyor...', 'info');
            const testData = {
                symbol: 'BTCUSDT',
                action: 'BUY', 
                price: '999.99',
                message: 'Dashboard Test - ' + new Date().toLocaleString('tr-TR')
            };
            
            fetch('/webhook/tradingview', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(testData)
            }).then(function(response) { return response.json(); })
            .then(function(data) {
                if (data.success) {
                    showNotification('Webhook test başarılı!', 'success');
                    setTimeout(function() { refreshSignals(); }, 1000);
                } else {
                    showNotification('Test başarısız!', 'error');
                }
            }).catch(function() {
                showNotification('Test başarısız!', 'error');
            });
        }
        
        // Refresh signals
        function refreshSignals() {
            const container = document.getElementById('recent-signals');
            container.innerHTML = '<div class="text-center p-3"><i class="fas fa-spinner fa-spin"></i> Yenileniyor...</div>';
            
            fetch('/admin/recent-signals?password=ParatonerPro2025!')
            .then(function(response) { return response.json(); })
            .then(function(data) {
                let html = '';
                if (data.signals && data.signals.length > 0) {
                    data.signals.slice(0, 5).forEach(function(signal) {
                        const color = signal.action && signal.action.toLowerCase().includes('buy') ? '#28a745' : '#dc3545';
                        html += '<div class="border-start border-4 p-2 mb-2 bg-light" style="border-color: ' + color + '!important;">' +
                                '<strong style="color: ' + color + ';">' + (signal.symbol || 'N/A') + ' - ' + (signal.action || 'N/A') + '</strong>' +
                                '<div class="small text-muted">' + (signal.price || 'N/A') + ' | ' + (signal.timestamp || '') + '</div>' +
                                '<div class="small">TG: ' + (signal.telegram_success ? '✅' : '❌') + ' | WA: ' + (signal.whatsapp_success ? '✅' : '❌') + '</div>' +
                                '</div>';
                    });
                } else {
                    html = '<div class="text-center text-muted p-3">Henüz sinyal yok</div>';
                }
                container.innerHTML = html;
            }).catch(function() {
                container.innerHTML = '<div class="text-center text-danger p-3">Yükleme hatası</div>';
            });
        }
        
        // Load initial data
        function loadServiceStatus() {
            fetch('/admin/service-status?password=ParatonerPro2025!')
            .then(function(response) { return response.json(); })
            .then(function(data) {
                updateServiceStatus('telegram', data.telegram.enabled);
                updateServiceStatus('whatsapp', data.whatsapp.enabled);
            }).catch(function() {
                console.log('Service status load failed');
            });
        }
        
        // Enhanced management functions
        function showApiKeyManager() {
            document.getElementById('apiKeyModal').style.display = 'block';
            loadCurrentApiKeys();
        }
        
        function closeModal() {
            document.getElementById('apiKeyModal').style.display = 'none';
        }
        
        function loadCurrentApiKeys() {
            fetch('/admin/get-api-keys?password=ParatonerPro2025!')
            .then(function(response) { return response.json(); })
            .then(function(data) {
                if (data.telegram) {
                    document.getElementById('telegram-token').value = data.telegram.token || '';
                    document.getElementById('telegram-chat-id').value = data.telegram.chat_id || '';
                }
                if (data.whatsapp) {
                    document.getElementById('twilio-sid').value = data.whatsapp.account_sid || '';
                    document.getElementById('twilio-from').value = data.whatsapp.from_number || '';
                    document.getElementById('twilio-to').value = data.whatsapp.to_number || '';
                }
            }).catch(function(error) {
                showNotification('API anahtarları yüklenemedi!', 'error');
            });
        }
        
        function saveApiKeys() {
            const apiData = {
                password: 'ParatonerPro2025!',
                telegram: {
                    token: document.getElementById('telegram-token').value,
                    chat_id: document.getElementById('telegram-chat-id').value
                },
                whatsapp: {
                    account_sid: document.getElementById('twilio-sid').value,
                    auth_token: document.getElementById('twilio-token').value,
                    from_number: document.getElementById('twilio-from').value,
                    to_number: document.getElementById('twilio-to').value
                }
            };
            
            fetch('/admin/update-api-keys', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(apiData)
            }).then(function(response) { return response.json(); })
            .then(function(data) {
                if (data.success) {
                    showNotification('API anahtarları güncellendi!', 'success');
                    closeModal();
                } else {
                    showNotification('Güncelleme başarısız!', 'error');
                }
            }).catch(function() {
                showNotification('Bağlantı hatası!', 'error');
            });
        }
        
        function exportData() {
            showNotification('Veriler hazırlanıyor...', 'info');
            fetch('/admin/export-data?password=ParatonerPro2025!')
            .then(function(response) { return response.blob(); })
            .then(function(blob) {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'paratoner-backup-' + new Date().toISOString().slice(0,10) + '.json';
                a.click();
                window.URL.revokeObjectURL(url);
                showNotification('Veri dışarı aktarımı tamamlandı!', 'success');
            }).catch(function() {
                showNotification('Dışarı aktarım hatası!', 'error');
            });
        }
        
        function showSystemLogs() {
            document.getElementById('logsModal').style.display = 'block';
            refreshLogs();
        }
        
        function closeLogsModal() {
            document.getElementById('logsModal').style.display = 'none';
        }
        
        function refreshLogs() {
            fetch('/admin/get-logs?password=ParatonerPro2025!')
            .then(function(response) { return response.json(); })
            .then(function(data) {
                document.getElementById('system-logs-content').textContent = data.logs;
            }).catch(function() {
                document.getElementById('system-logs-content').textContent = 'Log yükleme hatası';
            });
        }
        
        
        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            refreshSignals();
            loadServiceStatus();
            
            // Auto-refresh every 30 seconds
            setInterval(function() {
                loadServiceStatus();
            }, 30000);
        });
    </script>
</body>
</html>
    ''', webhook_url=WEBHOOK_URL)

@app.route('/webhook/tradingview', methods=['POST'])
def webhook():
    try:
        data = request.get_json()
        alarm = {
            'id': f"py{datetime.now().strftime('%Y%m%d%H%M%S')}",
            'timestamp': datetime.now().isoformat(),
            'symbol': data.get('symbol', 'N/A'),
            'action': data.get('action', 'N/A'),
            'price': data.get('price', 'N/A'),
            'message': data.get('message', 'Sinyal'),
            'telegram_success': False,
            'whatsapp_success': False
        }
        
        message = f"🤖 <b>Paratoner Bot</b>\n🚀 <b>{alarm['symbol']}</b> - {alarm['action']}\n💰 Fiyat: {alarm['price']}\n📅 {datetime.now().strftime('%H:%M:%S')}\n📝 {alarm['message']}"
        
        if service_config['telegram']['enabled']:
            alarm['telegram_success'] = send_telegram_message(message)
        if service_config['whatsapp']['enabled']:
            alarm['whatsapp_success'] = send_whatsapp_message(message.replace('<b>', '').replace('</b>', ''))
        
        alarms.append(alarm)
        # Keep 3 months of history (approximately 2500 signals)
        if len(alarms) > 2500:
            alarms.pop(0)
        
        log_system_event('WEBHOOK_RECEIVED', f"{alarm['symbol']} ({alarm['action']}) - Telegram: {'✅' if alarm['telegram_success'] else '❌'}, WhatsApp: {'✅' if alarm['whatsapp_success'] else '❌'}")
        logger.info(f"Webhook: {alarm['symbol']} - TG: {alarm['telegram_success']}, WA: {alarm['whatsapp_success']}")
        return jsonify({
            'success': True, 'alarm_id': alarm['id'],
            'telegram': alarm['telegram_success'], 'whatsapp': alarm['whatsapp_success']
        })
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/toggle-service', methods=['POST'])
def toggle_service():
    data = request.get_json()
    if not data.get('password') or not verify_password(data.get('password')):
        return jsonify({'error': 'Unauthorized'}), 401
    
    service = data.get('service')
    if service in service_config:
        service_config[service]['enabled'] = not service_config[service]['enabled']
        status = 'aktif' if service_config[service]['enabled'] else 'pasif'
        log_system_event('SERVICE_TOGGLE', f'{service.upper()} servisi {status} edildi')
        return jsonify({
            'success': True, 'service': service, 'enabled': service_config[service]['enabled'],
            'message': f'{service.upper()} servisi {status} edildi'
        })
    return jsonify({'success': False, 'error': 'Invalid service'}), 400

@app.route('/admin/test-message', methods=['POST'])
def test_message():
    data = request.get_json()
    if not data.get('password') or not verify_password(data.get('password')):
        return jsonify({'error': 'Unauthorized'}), 401
    
    service = data.get('service')
    original_message = data.get('message', 'Test mesajı')
    message = f"🤖 Paratoner Bot\n{original_message}"
    
    success = False
    if service == 'telegram':
        success = send_telegram_message(message)
    elif service == 'whatsapp':
        success = send_whatsapp_message(message)
    
    return jsonify({'success': success})

@app.route('/admin/service-status')
def service_status():
    password = request.args.get('password')
    if not password or not verify_password(password):
        return jsonify({'error': 'Unauthorized'}), 401
    return jsonify({
        'telegram': {'enabled': service_config['telegram']['enabled']},
        'whatsapp': {'enabled': service_config['whatsapp']['enabled']}
    })

@app.route('/admin/recent-signals')
def recent_signals():
    password = request.args.get('password')
    if not password or not verify_password(password):
        return jsonify({'error': 'Unauthorized'}), 401
    return jsonify({'signals': list(reversed(alarms[-10:]))})

# New enhanced management endpoints
@app.route('/admin/get-api-keys')
def get_api_keys():
    password = request.args.get('password')
    if not password or not verify_password(password):
        return jsonify({'error': 'Unauthorized'}), 401
    
    # Return masked keys for security
    return jsonify({
        'telegram': {
            'token': api_keys_config['telegram']['token'][:10] + '***' if api_keys_config['telegram']['token'] else '',
            'chat_id': api_keys_config['telegram']['chat_id']
        },
        'whatsapp': {
            'account_sid': api_keys_config['whatsapp']['account_sid'][:10] + '***' if api_keys_config['whatsapp']['account_sid'] else '',
            'from_number': api_keys_config['whatsapp']['from_number'],
            'to_number': api_keys_config['whatsapp']['to_number']
        }
    })

@app.route('/admin/update-api-keys', methods=['POST'])
def update_api_keys():
    data = request.get_json()
    if not data.get('password') or not verify_password(data.get('password')):
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        # Update API keys
        if data.get('telegram'):
            tg_data = data['telegram']
            if tg_data.get('token') and not tg_data['token'].endswith('***'):
                api_keys_config['telegram']['token'] = tg_data['token']
            if tg_data.get('chat_id'):
                api_keys_config['telegram']['chat_id'] = tg_data['chat_id']
        
        if data.get('whatsapp'):
            wa_data = data['whatsapp']
            if wa_data.get('account_sid') and not wa_data['account_sid'].endswith('***'):
                api_keys_config['whatsapp']['account_sid'] = wa_data['account_sid']
            if wa_data.get('auth_token'):
                api_keys_config['whatsapp']['auth_token'] = wa_data['auth_token']
            if wa_data.get('from_number'):
                api_keys_config['whatsapp']['from_number'] = wa_data['from_number']
            if wa_data.get('to_number'):
                api_keys_config['whatsapp']['to_number'] = wa_data['to_number']
        
        log_system_event('API_KEYS_UPDATED', 'Telegram ve WhatsApp API anahtarları güncellendi')
        return jsonify({'success': True, 'message': 'API keys updated'})
    
    except Exception as e:
        log_system_event('API_KEYS_ERROR', str(e), 'ERROR')
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/export-data')
def export_data():
    password = request.args.get('password')
    if not password or not verify_password(password):
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        backup_data = {
            'export_timestamp': datetime.now().isoformat(),
            'system_version': '2.0.0',
            'alarms': alarms,
            'service_config': {
                'telegram': {'enabled': service_config['telegram']['enabled']},
                'whatsapp': {'enabled': service_config['whatsapp']['enabled']}
            },
            'total_alarms': len(alarms),
            'uptime_seconds': (datetime.now() - system_metrics['last_restart']).total_seconds()
        }
        
        # Save backup
        backup_filename = f"backups/backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(backup_filename, 'w', encoding='utf-8') as f:
            json.dump(backup_data, f, ensure_ascii=False, indent=2)
        
        log_system_event('DATA_EXPORT', f'{len(alarms)} sinyal ve sistem ayarları')
        
        response = app.response_class(
            response=json.dumps(backup_data, ensure_ascii=False, indent=2),
            status=200,
            mimetype='application/json',
            headers={'Content-Disposition': f'attachment; filename=paratoner-backup-{datetime.now().strftime("%Y%m%d")}.json'}
        )
        return response
        
    except Exception as e:
        log_system_event('EXPORT_ERROR', str(e), 'ERROR')
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/get-logs')
def get_logs():
    password = request.args.get('password')
    if not password or not verify_password(password):
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        logs = ""
        if os.path.exists('logs/system.log'):
            with open('logs/system.log', 'r', encoding='utf-8') as f:
                lines = f.readlines()
                logs = ''.join(lines[-100:])  # Last 100 lines
        
        if not logs:
            logs = "Henüz log kaydı yok."
            
        return jsonify({'logs': logs})
        
    except Exception as e:
        return jsonify({'logs': f'Log okuma hatası: {str(e)}'})

@app.route('/admin/system-stats')
def get_system_stats():
    password = request.args.get('password')
    if not password or not verify_password(password):
        return jsonify({'error': 'Unauthorized'}), 401
    
    # Update metrics
    system_metrics['total_signals'] = len(alarms)
    system_metrics['uptime'] = (datetime.now() - system_metrics['last_restart']).total_seconds()
    
    return jsonify({
        'total_signals': system_metrics['total_signals'],
        'average_delay': system_metrics.get('average_delay', 0),
        'telegram_health': service_config['telegram']['health'],
        'whatsapp_health': service_config['whatsapp']['health'],
        'uptime_seconds': system_metrics['uptime'],
        'telegram_retry_count': service_config['telegram']['retry_count'],
        'whatsapp_retry_count': service_config['whatsapp']['retry_count']
    })

if __name__ == '__main__':
    print("🚀 Paratoner Signal Pro - Python Flask Server")
    print(f"📡 Webhook URL: {WEBHOOK_URL}")
    print("🔑 Dashboard: http://localhost:5000/?password=admin")
    app.run(host='0.0.0.0', port=5000, debug=True)