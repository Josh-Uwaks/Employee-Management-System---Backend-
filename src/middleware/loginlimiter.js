// rateLimiter.js
const rateLimit = require('express-rate-limit');
const { logEvents } = require('./logger')


const loginLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 5, // Limit each IP to 5 requests per window
    message: {
        message: 'Too many login attempts from this IP. Please try again after 60 seconds.',
    },
    handler: (req, res, next, options) => {
        const logMessage = `Too Many Requests: ${options.message.message} | ${req.method} ${req.url} | Origin: ${req.headers.origin}`;
        logEvents(logMessage, 'errLog.log');

        return res
            .status(options.statusCode)
            .json(options.message);
    },
    standardHeaders: true,   // Includes `RateLimit-*` headers
    legacyHeaders: false,    // Disables `X-RateLimit-*` headers
});

module.exports = loginLimiter;
