const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('./logger');

class StorageService {
    constructor() {
        this.dataPath = config.storage.dataPath;
        this.maxAlarms = config.storage.maxAlarms;
        this.alarmsFile = path.join(this.dataPath, 'alarms.json');
        
        this.ensureDataDirectory();
        this.alarms = this.loadAlarms();
    }

    ensureDataDirectory() {
        try {
            if (!fs.existsSync(this.dataPath)) {
                fs.mkdirSync(this.dataPath, { recursive: true });
                logger.info(`Created data directory: ${this.dataPath}`);
            }
        } catch (error) {
            logger.error('Failed to create data directory:', error.message);
            throw error;
        }
    }

    loadAlarms() {
        try {
            if (fs.existsSync(this.alarmsFile)) {
                const data = fs.readFileSync(this.alarmsFile, 'utf8');
                const parsed = JSON.parse(data);
                logger.info(`Loaded ${parsed.length} alarms from storage`);
                return parsed;
            }
        } catch (error) {
            logger.warn('Failed to load alarms, starting with empty array:', error.message);
        }
        return [];
    }

    saveAlarms() {
        try {
            const data = JSON.stringify(this.alarms, null, 2);
            fs.writeFileSync(this.alarmsFile, data, 'utf8');
            return true;
        } catch (error) {
            logger.error('Failed to save alarms:', error.message);
            return false;
        }
    }

    addAlarm(alarmData, deliveryResults = {}) {
        try {
            const alarm = {
                id: this.generateId(),
                timestamp: new Date().toISOString(),
                data: alarmData,
                delivery: {
                    telegram: deliveryResults.telegram || { attempted: false },
                    whatsapp: deliveryResults.whatsapp || { attempted: false }
                },
                status: this.determineStatus(deliveryResults)
            };

            this.alarms.unshift(alarm);

            // Maintain maximum number of alarms
            if (this.alarms.length > this.maxAlarms) {
                const removed = this.alarms.splice(this.maxAlarms);
                logger.info(`Removed ${removed.length} old alarms to maintain storage limit`);
            }

            this.saveAlarms();
            logger.info(`Stored alarm with ID: ${alarm.id}`);
            
            return alarm;
        } catch (error) {
            logger.error('Failed to add alarm to storage:', error.message);
            throw error;
        }
    }

    updateAlarm(id, updates) {
        try {
            const index = this.alarms.findIndex(alarm => alarm.id === id);
            if (index === -1) {
                throw new Error(`Alarm with ID ${id} not found`);
            }

            this.alarms[index] = { ...this.alarms[index], ...updates };
            this.saveAlarms();
            
            return this.alarms[index];
        } catch (error) {
            logger.error('Failed to update alarm:', error.message);
            throw error;
        }
    }

    getAlarms(options = {}) {
        const { 
            limit = 50, 
            offset = 0, 
            status = null,
            since = null 
        } = options;

        let filtered = [...this.alarms];

        // Filter by status
        if (status) {
            filtered = filtered.filter(alarm => alarm.status === status);
        }

        // Filter by date
        if (since) {
            const sinceDate = new Date(since);
            filtered = filtered.filter(alarm => new Date(alarm.timestamp) >= sinceDate);
        }

        // Apply pagination
        const total = filtered.length;
        const paged = filtered.slice(offset, offset + limit);

        return {
            alarms: paged,
            total,
            offset,
            limit,
            hasMore: offset + limit < total
        };
    }

    getAlarmById(id) {
        return this.alarms.find(alarm => alarm.id === id);
    }

    getStats() {
        const total = this.alarms.length;
        const last24h = this.alarms.filter(alarm => {
            const alarmTime = new Date(alarm.timestamp);
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            return alarmTime >= yesterday;
        }).length;

        const successful = this.alarms.filter(alarm => alarm.status === 'success').length;
        const failed = this.alarms.filter(alarm => alarm.status === 'failed').length;
        const partial = this.alarms.filter(alarm => alarm.status === 'partial').length;

        const telegramStats = {
            attempted: this.alarms.filter(alarm => alarm.delivery.telegram.attempted).length,
            successful: this.alarms.filter(alarm => alarm.delivery.telegram.success).length
        };

        const whatsappStats = {
            attempted: this.alarms.filter(alarm => alarm.delivery.whatsapp.attempted).length,
            successful: this.alarms.filter(alarm => alarm.delivery.whatsapp.success).length
        };

        return {
            total,
            last24h,
            status: {
                successful,
                failed,
                partial
            },
            delivery: {
                telegram: telegramStats,
                whatsapp: whatsappStats
            }
        };
    }

    clearOldAlarms(olderThanDays = 30) {
        try {
            const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
            const beforeCount = this.alarms.length;
            
            this.alarms = this.alarms.filter(alarm => {
                return new Date(alarm.timestamp) >= cutoffDate;
            });

            const removedCount = beforeCount - this.alarms.length;
            
            if (removedCount > 0) {
                this.saveAlarms();
                logger.info(`Cleared ${removedCount} alarms older than ${olderThanDays} days`);
            }

            return removedCount;
        } catch (error) {
            logger.error('Failed to clear old alarms:', error.message);
            throw error;
        }
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    determineStatus(deliveryResults) {
        const telegramSuccess = deliveryResults.telegram?.success === true;
        const whatsappSuccess = deliveryResults.whatsapp?.success === true;
        const telegramAttempted = deliveryResults.telegram?.attempted === true;
        const whatsappAttempted = deliveryResults.whatsapp?.attempted === true;

        if (!telegramAttempted && !whatsappAttempted) {
            return 'pending';
        }

        if ((telegramAttempted && telegramSuccess) && (whatsappAttempted && whatsappSuccess)) {
            return 'success';
        }

        if ((telegramAttempted && !telegramSuccess) && (whatsappAttempted && !whatsappSuccess)) {
            return 'failed';
        }

        if ((telegramAttempted && telegramSuccess) || (whatsappAttempted && whatsappSuccess)) {
            return 'partial';
        }

        return 'failed';
    }

    getRecentAlarms(limit = 10) {
        try {
            // En son alarmlari sirali olarak getir (yeniden eskiye)
            const sortedAlarms = [...this.alarms]
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, limit);
            
            return sortedAlarms;
        } catch (error) {
            logger.error('Failed to get recent alarms:', error.message);
            return [];
        }
    }
}

module.exports = new StorageService();
