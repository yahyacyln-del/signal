const axios = require('axios');
const config = require('../config');
const logger = require('./logger');

class TelegramService {
    constructor() {
        this.botToken = config.telegram.botToken;
        this.chatId = config.telegram.chatId;
        this.enabled = config.telegram.enabled;
        this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
    }

    isEnabled() {
        // Config dosyasından gerçek zamanlı enabled durumunu oku
        try {
            delete require.cache[require.resolve('../data/config.json')];
            const configData = require('../data/config.json');
            return configData.services?.telegram?.enabled || true;
        } catch (error) {
            return true; // Varsayılan olarak aktif
        }
    }

    async sendMessage(message, options = {}) {
        if (!this.isEnabled()) {
            logger.warn('Telegram service is disabled');
            return { success: false, error: 'Service disabled' };
        }

        if (!this.botToken || !this.chatId) {
            logger.error('Telegram configuration is incomplete');
            logger.error(`Bot Token exists: ${!!this.botToken}, Chat ID: ${this.chatId}`);
            return { success: false, error: 'Configuration incomplete' };
        }

        try {
            const payload = {
                chat_id: this.chatId,
                text: message,
                parse_mode: options.parseMode || 'HTML',
                disable_web_page_preview: options.disablePreview || true,
                disable_notification: options.silent || false
            };

            logger.info(`Sending to Telegram chat: ${this.chatId}`);

            const response = await axios.post(`${this.baseUrl}/sendMessage`, payload, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.data.ok) {
                logger.info('Telegram message sent successfully');
                return { 
                    success: true, 
                    messageId: response.data.result.message_id,
                    response: response.data
                };
            } else {
                logger.error('Telegram API error:', response.data);
                return { 
                    success: false, 
                    error: response.data.description || 'Unknown API error'
                };
            }
        } catch (error) {
            logger.error('Failed to send Telegram message:', error.message);
            
            if (error.response) {
                logger.error('Telegram API response:', error.response.data);
                return { 
                    success: false, 
                    error: `API Error: ${error.response.status} - ${error.response.data?.description || error.message}`
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
            return await this.sendMessage(message, { parseMode: 'HTML' });
        } catch (error) {
            logger.error('Failed to send alarm via Telegram:', error.message);
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

        let message = `🚨 <b>TradingView Alarm</b>\n\n`;
        message += `📅 <b>Zaman:</b> ${timestamp}\n`;
        
        if (alarmData.symbol) {
            message += `📊 <b>Sembol:</b> ${alarmData.symbol}\n`;
        }
        
        if (alarmData.price) {
            message += `💰 <b>Fiyat:</b> ${alarmData.price}\n`;
        }
        
        if (alarmData.message) {
            message += `📝 <b>Mesaj:</b> ${alarmData.message}\n`;
        }
        
        if (alarmData.strategy) {
            message += `🎯 <b>Strateji:</b> ${alarmData.strategy}\n`;
        }
        
        if (alarmData.timeframe) {
            message += `⏰ <b>Zaman Dilimi:</b> ${alarmData.timeframe}\n`;
        }

        // Add any additional fields from the webhook
        const excludeFields = ['symbol', 'price', 'message', 'strategy', 'timeframe'];
        Object.keys(alarmData).forEach(key => {
            if (!excludeFields.includes(key) && alarmData[key]) {
                const capitalizedKey = key.charAt(0).toUpperCase() + key.slice(1);
                message += `ℹ️ <b>${capitalizedKey}:</b> ${alarmData[key]}\n`;
            }
        });

        return message;
    }

    async testConnection() {
        try {
            const response = await axios.get(`${this.baseUrl}/getMe`, {
                timeout: 5000
            });
            
            if (response.data.ok) {
                logger.info('Telegram connection test successful');
                return { 
                    success: true, 
                    botInfo: response.data.result 
                };
            } else {
                return { 
                    success: false, 
                    error: response.data.description 
                };
            }
        } catch (error) {
            logger.error('Telegram connection test failed:', error.message);
            return { 
                success: false, 
                error: error.message 
            };
        }
    }

    isConfigured() {
        return !!(this.botToken && this.chatId);
    }
}

module.exports = new TelegramService();
