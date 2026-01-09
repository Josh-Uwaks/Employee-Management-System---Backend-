// logger.js
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

function getTimestamp() {
    return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'short',
        timeStyle: 'medium'
    }).format(new Date());
}

async function logEvents(message, logFileName) {
    try {
        const logItem = `${getTimestamp()}\t${message}\n`;

        const logsDir = path.join(__dirname, 'logs');

        // Ensure logs directory exists
        if (!fs.existsSync(logsDir)) {
            await fsPromises.mkdir(logsDir);
        }

        const logFilePath = path.join(logsDir, logFileName);

        // Append the log entry
        await fsPromises.appendFile(logFilePath, logItem);
    } catch (error) {
        console.error('Logging error:', error);
    }
}

module.exports = { logEvents };
