const express = require('express');
const router = express.Router();
const telegramService = require('../services/telegram');
const whatsappService = require('../services/whatsapp');
const storageService = require('../services/storage');
const logger = require('../services/logger');
const config = require('../config');

// Retry mechanism
async function retryOperation(operation, maxAttempts = 3, delay = 1000, exponentialBackoff = true) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await operation();
            if (result.success) {
                return result;
            }
            lastError = new Error(result.error || 'Operation failed');
        } catch (error) {
            lastError = error;
        }
        
        if (attempt < maxAttempts) {
            const currentDelay = exponentialBackoff ? delay * Math.pow(2, attempt - 1) : delay;
            logger.warn(`Attempt ${attempt} failed, retrying in ${currentDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, currentDelay));
        }
    }
    
    throw lastError;
}

// TradingView webhook endpoint
router.post('/tradingview', async (req, res) => {
    const startTime = Date.now();
    
    try {
        logger.info('Received TradingView webhook');
        
        // Validate request
        if (!req.body || Object.keys(req.body).length === 0) {
            logger.warn('Empty webhook payload received');
            return res.status(400).json({
                error: 'Empty payload',
                message: 'Webhook payload cannot be empty'
            });
        }

        const alarmData = req.body;
        logger.info('Processing alarm data:', alarmData);

        // Prepare delivery results
        const deliveryResults = {
            telegram: { attempted: false, success: false, error: null },
            whatsapp: { attempted: false, success: false, error: null }
        };

        // Send to Telegram with retry
        if (telegramService.isConfigured()) {
            try {
                deliveryResults.telegram.attempted = true;
                
                const telegramResult = await retryOperation(
                    () => telegramService.sendAlarm(alarmData),
                    config.retry.maxAttempts,
                    config.retry.delayMs,
                    config.retry.exponentialBackoff
                );
                
                deliveryResults.telegram.success = true;
                deliveryResults.telegram.response = telegramResult;
                logger.info('Telegram delivery successful');
                
            } catch (error) {
                deliveryResults.telegram.error = error.message;
                logger.error('Telegram delivery failed after retries:', error.message);
            }
        } else {
            logger.warn('Telegram service not configured, skipping');
        }

        // Send to WhatsApp with retry
        if (whatsappService.isConfigured() && whatsappService.enabled) {
            try {
                deliveryResults.whatsapp.attempted = true;
                
                const whatsappResult = await retryOperation(
                    () => whatsappService.sendAlarm(alarmData),
                    config.retry.maxAttempts,
                    config.retry.delayMs,
                    config.retry.exponentialBackoff
                );
                
                deliveryResults.whatsapp.success = true;
                deliveryResults.whatsapp.response = whatsappResult;
                logger.info('WhatsApp delivery successful');
                
            } catch (error) {
                deliveryResults.whatsapp.error = error.message;
                logger.error('WhatsApp delivery failed after retries:', error.message);
            }
        } else {
            logger.warn('WhatsApp service not configured, skipping');
        }

        // Store alarm in database
        const storedAlarm = storageService.addAlarm(alarmData, deliveryResults);
        
        // Determine overall success
        const telegramSuccess = !deliveryResults.telegram.attempted || deliveryResults.telegram.success;
        const whatsappSuccess = !deliveryResults.whatsapp.attempted || deliveryResults.whatsapp.success;
        const overallSuccess = telegramSuccess && whatsappSuccess;
        
        const processingTime = Date.now() - startTime;
        
        const response = {
            success: overallSuccess,
            alarmId: storedAlarm.id,
            timestamp: new Date().toISOString(),
            processingTimeMs: processingTime,
            delivery: {
                telegram: {
                    attempted: deliveryResults.telegram.attempted,
                    success: deliveryResults.telegram.success,
                    error: deliveryResults.telegram.error
                },
                whatsapp: {
                    attempted: deliveryResults.whatsapp.attempted,
                    success: deliveryResults.whatsapp.success,
                    error: deliveryResults.whatsapp.error
                }
            }
        };

        const statusCode = overallSuccess ? 200 : 207; // 207 = Multi-Status
        res.status(statusCode).json(response);
        
        logger.info(`Webhook processing completed in ${processingTime}ms with status: ${storedAlarm.status}`);

    } catch (error) {
        logger.error('Webhook processing failed:', error);
        
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Test endpoint for manual testing
router.post('/test', async (req, res) => {
    try {
        const testData = req.body.data || {
            symbol: 'BTCUSDT',
            price: '50000',
            message: 'Test alarm from webhook endpoint',
            strategy: 'Test Strategy',
            timeframe: '1h'
        };

        logger.info('Processing test alarm');
        
        // Redirect to main webhook handler
        req.body = testData;
        return router.handle({ method: 'POST', url: '/tradingview' }, req, res);
        
    } catch (error) {
        logger.error('Test endpoint failed:', error);
        res.status(500).json({
            error: 'Test failed',
            message: error.message
        });
    }
});

// Webhook status endpoint
router.get('/status', (req, res) => {
    const stats = storageService.getStats();
    
    res.json({
        status: 'active',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: {
            telegram: {
                configured: telegramService.isConfigured(),
                enabled: telegramService.enabled
            },
            whatsapp: {
                configured: whatsappService.isConfigured(),
                enabled: whatsappService.enabled
            }
        },
        statistics: stats
    });
});

module.exports = router;
