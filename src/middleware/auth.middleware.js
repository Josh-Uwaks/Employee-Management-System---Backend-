const {verifyToken} = require('../utils/jwt');
const User = require('../models/staff');

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Access Denied. No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = verifyToken(token);

        const user = await User.findById(decoded.id).select('-password');
        if (!user || !user.is_active) {
            return res.status(401).json({ message: 'Access Denied. User not found or inactive' });
        }

        req.user = user;
        next();

    } catch (error) {
        return res.status(401).json({ 
            message: 'Invalid or expired token'
        });
    }
}


module.exports = { authMiddleware }