const axios = require('axios');
const config = require('../config');
const logger = require('./logger');

class WhatsAppService {
    constructor() {
        this.accountSid = config.whatsapp.accountSid;
        this.authToken = config.whatsapp.authToken;
        this.fromNumber = config.whatsapp.fromNumber;
        this.toNumber = config.whatsapp.toNumber;
        this.enabled = config.whatsapp.enabled;
        this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}`;
    }

    isEnabled() {
        // Config dosyasından gerçek zamanlı enabled durumunu oku
        try {
            delete require.cache[require.resolve('../data/config.json')];
            const configData = require('../data/config.json');
            return configData.services?.whatsapp?.enabled || true;
        } catch (error) {
            return true; // Varsayılan olarak aktif
        }
    }

    async sendMessage(message, options = {}) {
        if (!this.isEnabled()) {
            logger.warn('WhatsApp service is disabled');
            return { success: false, error: 'Service disabled' };
        }

        if (!this.isConfigured()) {
            logger.error('WhatsApp/Twilio configuration is incomplete');
            return { success: false, error: 'Configuration incomplete' };
        }

        try {
            // WhatsApp numaraları için whatsapp: prefix'i ekle
            // Numara temizle (sadece + ve rakamlar)
            const cleanFromNumber = this.fromNumber.replace(/\D/g, '');
            const cleanToNumber = this.toNumber.replace(/\D/g, '');
            
            const fromNumber = `whatsapp:+${cleanFromNumber}`;
            const toNumber = `whatsapp:+${cleanToNumber}`;

            const payload = new URLSearchParams({
                From: fromNumber,
                To: toNumber,
                Body: message
            });

            const authHeader = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

            logger.info(`Sending WhatsApp from ${fromNumber} to ${toNumber}`);

            const response = await axios.post(`${this.baseUrl}/Messages.json`, payload, {
                timeout: 15000,
                headers: {
                    'Authorization': `Basic ${authHeader}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            if (response.status === 201) {
                logger.info('WhatsApp message sent successfully');
                return { 
                    success: true, 
                    messageSid: response.data.sid,
                    response: response.data
                };
            } else {
                logger.error('WhatsApp/Twilio API error:', response.data);
                return { 
                    success: false, 
                    error: response.data.message || 'Unknown API error'
                };
            }
        } catch (error) {
            logger.error('Failed to send WhatsApp message:', error.message);
            
            if (error.response) {
                const errorData = error.response.data;
                return { 
                    success: false, 
                    error: `Twilio Error: ${error.response.status} - ${errorData?.message || error.message}`,
                    code: errorData?.code
                };
            }
            
            return { 
                success: false, 
                error: error.message
            };
        }
    }

    async sendAlarm(alarmData) {
        try {
            const message = this.formatAlarmMessage(alarmData);
            return await this.sendMessage(message);
        } catch (error) {
            logger.error('Failed to send alarm via WhatsApp:', error.message);
            return { success: false, error: error.message };
        }
    }

    formatAlarmMessage(alarmData) {
        const timestamp = new Date().toLocaleString('tr-TR', {
            timeZone: 'Europe/Istanbul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        let message = `🚨 *TradingView Alarm*\n\n`;
        message += `📅 *Zaman:* ${timestamp}\n`;
        
        if (alarmData.symbol) {
            message += `📊 *Sembol:* ${alarmData.symbol}\n`;
        }
        
        if (alarmData.price) {
            message += `💰 *Fiyat:* ${alarmData.price}\n`;
        }
        
        if (alarmData.message) {
            message += `📝 *Mesaj:* ${alarmData.message}\n`;
        }
        
        if (alarmData.strategy) {
            message += `🎯 *Strateji:* ${alarmData.strategy}\n`;
        }
        
        if (alarmData.timeframe) {
            message += `⏰ *Zaman Dilimi:* ${alarmData.timeframe}\n`;
        }

        // Add any additional fields from the webhook
        const excludeFields = ['symbol', 'price', 'message', 'strategy', 'timeframe'];
        Object.keys(alarmData).forEach(key => {
            if (!excludeFields.includes(key) && alarmData[key]) {
                const capitalizedKey = key.charAt(0).toUpperCase() + key.slice(1);
                message += `ℹ️ *${capitalizedKey}:* ${alarmData[key]}\n`;
            }
        });

        return message;
    }

    async sendTestMessage() {
        const testMessage = `🚨 WhatsApp Test Mesajı
        
📅 Zaman: ${new Date().toLocaleString('tr-TR')}
📱 TradingView Alarm Relay Sistemi aktif!
✅ WhatsApp entegrasyonu çalışıyor`;

        return await this.sendMessage(testMessage);
    }

    async testConnection() {
        try {
            // Test by sending a test message
            logger.info('Testing WhatsApp connection by sending test message...');
            const testResult = await this.sendTestMessage();
            
            if (testResult.success) {
                logger.info('WhatsApp connection test successful - test message sent');
                return { 
                    success: true, 
                    message: 'Test message sent successfully'
                };
            } else {
                logger.error('WhatsApp test message failed:', testResult.error);
                return { 
                    success: false, 
                    error: testResult.error
                };
            }
        } catch (error) {
            logger.error('WhatsApp/Twilio connection test failed:', error.message);
            return { 
                success: false, 
                error: error.message 
            };
        }
    }

    isConfigured() {
        return !!(this.accountSid && this.authToken && this.fromNumber && this.toNumber);
    }
}

module.exports = new WhatsAppService();
