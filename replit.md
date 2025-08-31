# Paratoner Signal Pro - TradingView Webhook System

## Overview

**Paratoner Signal Pro** is a comprehensive Python Flask-based webhook system that receives TradingView alerts and forwards them to messaging platforms (Telegram and WhatsApp). The system features a modern web dashboard with admin authentication, real-time signal tracking, API key management, backup system, and enhanced security with user-friendly Turkish logging.

**External Webhook URL:** https://wtel.onrender.com/webhook/tradingview
**All messages are prefixed with:** "🤖 Paratoner Bot"

## User Preferences

- **Communication Style:** Simple, everyday language
- **Language:** Turkish for system logs and user interface
- **Security:** Strong password protection with SHA256 hashing
- **Design:** Modern gradient UI with dynamic button colors

## Current System Status

### Project Migration
- **Successfully migrated from Node.js to Python Flask** (resolved JavaScript template literal errors)
- **Enhanced security system** with strong password "ParatonerPro2025!" using SHA256 hashing
- **Modern login page** with gradient styling and secure password handling

### Key Features Implemented
- ✅ **Single Admin Access Control** with secure login system
- ✅ **Real-Time Signal Tracking** with 3-month history retention (2500 signals)
- ✅ **API Key Management** with service descriptions and validation
- ✅ **JSON Backup System** for data export and recovery
- ✅ **Enhanced Security** with password hashing and session management
- ✅ **User-Friendly Turkish Logging** with emojis and readable timestamps
- ✅ **Dynamic Button Colors** (green for active, red for passive services)
- ✅ **Clean UI Design** with removed "relay" text throughout interface

## System Architecture

### Backend Architecture
- **Framework:** Python Flask with secure session management
- **Configuration Management:** JSON-based configuration with environment variable support
- **Service-Oriented Design:** Modular Python services for messaging, storage, and logging
- **Webhook Processing:** Dedicated TradingView webhook endpoint with retry mechanisms

### Security Features
- **Password Protection:** SHA256 hashed strong password "ParatonerPro2025!"
- **Session Management:** Secure admin session handling
- **API Validation:** Input validation and error handling
- **Service Health Monitoring:** Real-time status tracking and validation

### Data Storage & Management
- **Signal History:** 3-month retention (2500 signals) with automatic cleanup
- **File-Based Storage:** JSON files for alarm history and configuration
- **Backup System:** Automatic JSON backup generation with timestamps
- **Logging:** User-friendly Turkish logs with emojis and readable format

### Messaging Integration
- **Telegram Service:** Bot API integration with retry logic and success tracking
- **WhatsApp Service:** Twilio API integration (starts as passive by default)
- **Message Prefixing:** All messages prefixed with "🤖 Paratoner Bot"
- **Service Status:** Dynamic visual indicators with green/red button colors

### Frontend Architecture
- **Modern UI:** Bootstrap-based dashboard with gradient design
- **Real-Time Updates:** Auto-refresh capabilities for service status and signals
- **API Management:** Modal-based API key configuration with service descriptions
- **Responsive Design:** Mobile-friendly interface with dynamic status indicators

## Configuration Settings

### Default Service States
- **Telegram:** Active by default
- **WhatsApp:** Passive by default (security measure)
- **Signal Retention:** 3 months (2500 signals)
- **Logging:** Turkish language with emoji indicators

### API Requirements
- **Telegram:** Bot Token (@BotFather) + Chat ID (numeric)
- **WhatsApp:** Twilio Account SID + Auth Token + Phone Numbers

## Log System Features

### User-Friendly Turkish Logs
- ✅ **Success Operations:** Başarılı işlemler
- ❌ **Error Operations:** Hatalı işlemler  
- 📨 **Incoming Signals:** Gelen sinyaller
- ⚙️ **System Changes:** Sistem değişiklikleri
- 🔑 **API Updates:** API güncellemeleri
- 💾 **Backup Operations:** Yedekleme işlemleri

### Log Format Example
```
29.08.2025 20:38:42 | ✅ Telegram mesajı başarıyla gönderildi: 1. deneme ile gönderildi
29.08.2025 20:38:42 | 📨 Yeni sinyal alındı: BTCUSDT (BUY) - Telegram: ✅, WhatsApp: ❌
29.08.2025 20:39:15 | ⚙️ Servis durumu değiştirildi: WHATSAPP servisi aktif edildi
```

## External Dependencies

### Messaging Platforms
- **Telegram Bot API:** Bot token and chat ID for message delivery
- **Twilio WhatsApp API:** Account SID, auth token, and phone numbers

### Python Dependencies
- **Flask:** Web framework for API and dashboard
- **Requests:** HTTP client for external API communications
- **Twilio:** WhatsApp messaging service integration
- **Hashlib:** Password hashing and security
- **JSON/OS/Datetime:** Core Python libraries for file operations and time handling

### Frontend Dependencies
- **Bootstrap 5.3.0:** Responsive UI framework
- **Font Awesome 6.4.0:** Icon library for dashboard elements

## Deployment Information

### Current Setup
- **Development Environment:** Python Flask with debug mode
- **Port Configuration:** 0.0.0.0:5000 (Replit standard)
- **Webhook Endpoint:** https://wtel.onrender.com/webhook/tradingview
- **Admin Access:** http://localhost:5000/?password=admin (redirects to secure login)

### Security Notes
- **Password:** ParatonerPro2025! (SHA256 hashed)
- **Session Management:** Secure admin sessions
- **Input Validation:** All endpoints validate input data
- **Error Handling:** Comprehensive error logging and user feedback

## Recent Updates

### Last Modified: August 29, 2025
- **Migration Completed:** Node.js to Python Flask
- **Security Enhanced:** Strong password protection implemented
- **UI Modernized:** Gradient design and dynamic button colors
- **Logging Improved:** Turkish language with emoji indicators
- **Service Management:** WhatsApp starts passive, 3-month signal history
- **Code Cleanup:** Removed "relay" text and improved user experience

### System Status: ✅ READY FOR DEPLOYMENT
All features implemented and tested. System is production-ready with enhanced security, user-friendly interface, and comprehensive logging system.