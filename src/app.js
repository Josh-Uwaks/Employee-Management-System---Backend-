const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

dotenv.config();

const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoute');
const activityRoutes = require('./routes/activityRoute');
const departmentRoutes = require('./routes/departmentRoute');

const app = express();

/* =========================
   DATABASE
========================= */
connectDB();

/* =========================
   CORS (NODE 22 SAFE)
========================= */
const allowedOrigins = [
  'http://localhost:3000',
  'https://kadick-official-log-monitor-9cdf4c4d3c69.herokuapp.com',
  'https://kadick-daily-log-ef17f6711eae.herokuapp.com'
  // 'https://app.kadickintegrated.com'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow Postman, curl, mobile apps
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('CORS not allowed'), false);
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));

/* =========================
   BODY PARSERS
========================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   REQUEST LOGGER (DEV)
========================= */
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

/* =========================
   ROUTES
========================= */
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/activities', activityRoutes);
app.use('/api/v1/departments', departmentRoutes);

/* =========================
   HEALTH CHECK
========================= */
app.get('/', (req, res) => {
  res.json({ message: 'Kadick API running 🚀' });
});

/* =========================
   404 HANDLER
========================= */
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

/* =========================
   GLOBAL ERROR HANDLER
========================= */
app.use((err, req, res, next) => {
  console.error('ERROR:', err.message);
  res.status(500).json({ message: 'Internal server error' });
});

module.exports = app;
