const express = require('express');
const router = express.Router();
const storageService = require('../services/storage');
const telegramService = require('../services/telegram');
const whatsappService = require('../services/whatsapp');
const logger = require('../services/logger');
const config = require('../config');

// Get dashboard statistics
router.get('/stats', (req, res) => {
    try {
        const stats = storageService.getStats();
        
        res.json({
            success: true,
            data: {
                ...stats,
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                services: {
                    telegram: {
                        configured: telegramService.isConfigured(),
                        enabled: telegramService.enabled
                    },
                    whatsapp: {
                        configured: whatsappService.isConfigured(),
                        enabled: whatsappService.enabled
                    }
                }
            }
        });
    } catch (error) {
        logger.error('Failed to get stats:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get alarms with pagination and filtering
router.get('/alarms', (req, res) => {
    try {
        const {
            limit = 20,
            offset = 0,
            status = null,
            since = null
        } = req.query;

        const options = {
            limit: parseInt(limit),
            offset: parseInt(offset),
            status,
            since
        };

        const result = storageService.getAlarms(options);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Failed to get alarms:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get specific alarm by ID
router.get('/alarms/:id', (req, res) => {
    try {
        const alarm = storageService.getAlarmById(req.params.id);
        
        if (!alarm) {
            return res.status(404).json({
                success: false,
                error: 'Alarm not found'
            });
        }
        
        res.json({
            success: true,
            data: alarm
        });
    } catch (error) {
        logger.error('Failed to get alarm:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Test service connections
router.post('/test-connections', async (req, res) => {
    try {
        const results = {
            telegram: { configured: false, success: false, error: null },
            whatsapp: { configured: false, success: false, error: null }
        };

        // Test Telegram
        results.telegram.configured = telegramService.isConfigured();
        if (results.telegram.configured) {
            const telegramTest = await telegramService.testConnection();
            results.telegram.success = telegramTest.success;
            results.telegram.error = telegramTest.error;
            results.telegram.data = telegramTest.botInfo;
        }

        // Test WhatsApp
        results.whatsapp.configured = whatsappService.isConfigured();
        if (results.whatsapp.configured) {
            const whatsappTest = await whatsappService.testConnection();
            results.whatsapp.success = whatsappTest.success;
            results.whatsapp.error = whatsappTest.error;
            results.whatsapp.data = whatsappTest.accountInfo;
        }

        const overallSuccess = 
            (!results.telegram.configured || results.telegram.success) &&
            (!results.whatsapp.configured || results.whatsapp.success);

        res.json({
            success: overallSuccess,
            data: results
        });
    } catch (error) {
        logger.error('Connection test failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Send test message
router.post('/test-message', async (req, res) => {
    try {
        const { service, message } = req.body;
        
        if (!service || !message) {
            return res.status(400).json({
                success: false,
                error: 'Service and message are required'
            });
        }

        let result;
        
        if (service === 'telegram') {
            if (!telegramService.isConfigured()) {
                return res.status(400).json({
                    success: false,
                    error: 'Telegram service not configured'
                });
            }
            result = await telegramService.sendMessage(message);
        } else if (service === 'whatsapp') {
            if (!whatsappService.isConfigured()) {
                return res.status(400).json({
                    success: false,
                    error: 'WhatsApp service not configured'
                });
            }
            result = await whatsappService.sendMessage(message);
        } else {
            return res.status(400).json({
                success: false,
                error: 'Invalid service. Use "telegram" or "whatsapp"'
            });
        }

        res.json({
            success: result.success,
            data: result,
            error: result.error
        });
    } catch (error) {
        logger.error('Test message failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get recent logs
router.get('/logs', (req, res) => {
    try {
        const lines = parseInt(req.query.lines) || 100;
        const logs = logger.getRecentLogs(lines);
        
        res.json({
            success: true,
            data: logs
        });
    } catch (error) {
        logger.error('Failed to get logs:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Clear old alarms
router.delete('/alarms/cleanup', (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const removedCount = storageService.clearOldAlarms(days);
        
        res.json({
            success: true,
            data: {
                removedCount,
                days
            }
        });
    } catch (error) {
        logger.error('Failed to cleanup alarms:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get configuration (safe - no secrets)
router.get('/config', (req, res) => {
    try {
        const safeConfig = {
            server: config.server,
            retry: config.retry,
            storage: config.storage,
            logging: config.logging,
            telegram: {
                enabled: config.telegram.enabled,
                configured: !!config.telegram.botToken && !!config.telegram.chatId
            },
            whatsapp: {
                enabled: config.whatsapp.enabled,
                configured: !!config.whatsapp.accountSid && !!config.whatsapp.authToken
            }
        };
        
        res.json({
            success: true,
            data: safeConfig
        });
    } catch (error) {
        logger.error('Failed to get config:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
