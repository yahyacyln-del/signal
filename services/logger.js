const fs = require('fs');
const path = require('path');
const config = require('../config');

class Logger {
    constructor() {
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
        
        this.currentLevel = this.levels[config.logging.level] || this.levels.info;
        this.logDir = path.join(__dirname, '..', 'logs');
        this.logFile = path.join(this.logDir, 'app.log');
        this.maxFileSize = this.parseSize(config.logging.maxFileSize);
        this.maxFiles = config.logging.maxFiles;
        
        this.ensureLogDirectory();
    }

    ensureLogDirectory() {
        try {
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }
        } catch (error) {
            console.error('Failed to create log directory:', error.message);
        }
    }

    parseSize(sizeStr) {
        const units = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
        const match = sizeStr.match(/^(\d+)\s*(B|KB|MB|GB)?$/i);
        if (!match) return 10 * 1024 * 1024; // Default 10MB
        
        const size = parseInt(match[1]);
        const unit = (match[2] || 'B').toUpperCase();
        return size * (units[unit] || 1);
    }

    formatMessage(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const formattedMessage = typeof message === 'object' ? JSON.stringify(message) : message;
        
        let dataStr = '';
        if (data !== null && data !== undefined) {
            if (typeof data === 'object') {
                const jsonStr = JSON.stringify(data);
                // Only add data string if it's not an empty object or empty array
                if (jsonStr !== '{}' && jsonStr !== '[]') {
                    dataStr = ` | Data: ${jsonStr}`;
                }
            } else if (data !== '') {
                dataStr = ` | Data: ${data}`;
            }
        }
        
        return `[${timestamp}] [${level.toUpperCase()}] ${formattedMessage}${dataStr}`;
    }

    writeToFile(message) {
        try {
            // Check file size and rotate if necessary
            if (fs.existsSync(this.logFile)) {
                const stats = fs.statSync(this.logFile);
                if (stats.size >= this.maxFileSize) {
                    this.rotateLog();
                }
            }

            fs.appendFileSync(this.logFile, message + '\n', 'utf8');
        } catch (error) {
            console.error('Failed to write to log file:', error.message);
        }
    }

    rotateLog() {
        try {
            // Move current log files
            for (let i = this.maxFiles - 1; i >= 1; i--) {
                const oldFile = `${this.logFile}.${i}`;
                const newFile = `${this.logFile}.${i + 1}`;
                
                if (fs.existsSync(oldFile)) {
                    if (i === this.maxFiles - 1) {
                        fs.unlinkSync(oldFile); // Delete oldest
                    } else {
                        fs.renameSync(oldFile, newFile);
                    }
                }
            }

            // Move current log to .1
            if (fs.existsSync(this.logFile)) {
                fs.renameSync(this.logFile, `${this.logFile}.1`);
            }
        } catch (error) {
            console.error('Failed to rotate log file:', error.message);
        }
    }

    log(level, message, data = null) {
        if (this.levels[level] > this.currentLevel) {
            return;
        }

        const formattedMessage = this.formatMessage(level, message, data);
        
        // Always output to console
        if (level === 'error') {
            console.error(formattedMessage);
        } else if (level === 'warn') {
            console.warn(formattedMessage);
        } else {
            console.log(formattedMessage);
        }

        // Write to file
        this.writeToFile(formattedMessage);
    }

    error(message, data = null) {
        this.log('error', message, data);
    }

    warn(message, data = null) {
        this.log('warn', message, data);
    }

    info(message, data = null) {
        this.log('info', message, data);
    }

    debug(message, data = null) {
        this.log('debug', message, data);
    }

    // Get recent log entries
    getRecentLogs(lines = 100) {
        try {
            if (!fs.existsSync(this.logFile)) {
                return [];
            }

            const content = fs.readFileSync(this.logFile, 'utf8');
            const logLines = content.trim().split('\n');
            
            return logLines.slice(-lines).map(line => {
                const match = line.match(/^\[([^\]]+)\] \[([^\]]+)\] (.+)$/);
                if (match) {
                    return {
                        timestamp: match[1],
                        level: match[2].toLowerCase(),
                        message: match[3]
                    };
                }
                return { timestamp: null, level: 'unknown', message: line };
            });
        } catch (error) {
            this.error('Failed to read log file:', error.message);
            return [];
        }
    }
}

module.exports = new Logger();
