import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import jobsRoutes from './routes/jobs.js';
import admissionsRoutes from './routes/admissions.js';
import teacherRoutes from './routes/teacher.js';
import studentRoutes from './routes/student.js';
import subjectsRoutes from './routes/subjects.js';
import bcrypt from 'bcryptjs';
import User from './models/User.js';
import SubjectMap from './models/SubjectMap.js';
import Class from './models/Class.js';
import Schedule from './models/Schedule.js';
import QuestionPaper from './models/QuestionPaper.js';

const app = express();
app.use(cors());
app.use(express.json());

// Static serving for site images placed in project /images
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const imagesDir = path.join(projectRoot, 'images');
if (fs.existsSync(imagesDir)) {
  app.use('/site-images', express.static(imagesDir));
}

const mongoUri = 'mongodb://localhost:27017/school_management';
const mongoOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  // Disable retryWrites if not using a replica set
  retryWrites: false
};

// Connect to MongoDB
mongoose.connect(mongoUri, mongoOptions).catch(err => {
  console.error('MongoDB connection error:', err.message);
  process.exit(1);
});

mongoose.connection.on('connected', async () => {
  console.log('MongoDB connected successfully');
  try {
    const email = 'pankaj@gmail.com';
    const existing = await User.findOne({ email });
    const hashedPassword = await bcrypt.hash('123456', 10);

    // For admin users, we'll use a default academic year since they don't belong to a specific class
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const academicYear = `${currentYear}-${nextYear}`;

    try {
      if (!existing) {
        // Create new admin user
        await User.create({
          name: 'Admin',
          email,
          password: hashedPassword,
          role: 'admin',
          verified: true,
          isApproved: true,
          academicYear: academicYear
        });
        console.log('Seeded default admin:', email);
      } else {
        // Update existing user to admin if needed
        const updates = {
          role: 'admin',
          password: hashedPassword,
          verified: true,
          isApproved: true,
          academicYear: academicYear
        };

        await User.findByIdAndUpdate(existing._id, { $set: updates });
        console.log('Admin user updated:', email);
      }
    } catch (error) {
      console.error('Error in admin user setup:', error.message);
      // Continue with server startup even if admin setup fails
    }

    // Seed 5 subjects for classes 1-12 if not present
    const defaultSubjects = ['English', 'Mathematics', 'Science', 'Social Studies', 'Hindi'];
    for (let c = 1; c <= 12; c++) {
      const found = await SubjectMap.findOne({ classNumber: c });
      if (!found) {
        await SubjectMap.create({ classNumber: c, subjects: defaultSubjects });
        console.log(`Seeded subjects for class ${c}`);
      }
    }
  } catch (e) {
    console.error('Error seeding default admin:', e.message);
  }
});
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err.message);
});

app.get('/', (req, res) => {
  res.send('API is running');
});

// List images available under /images so the client can build galleries dynamically
app.get('/api/site-images', async (req, res) => {
  try {
    if (!fs.existsSync(imagesDir)) return res.json([]);
    const all = await fs.promises.readdir(imagesDir);
    const allowed = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
    const files = all.filter(f => allowed.has(path.extname(f).toLowerCase()));
    const withMeta = await Promise.all(
      files.map(async (f) => {
        try {
          const stat = await fs.promises.stat(path.join(imagesDir, f));
          const v = stat.mtimeMs ? Math.floor(stat.mtimeMs) : Date.now();
          return `/site-images/${encodeURIComponent(f)}?v=${v}`;
        } catch {
          return `/site-images/${encodeURIComponent(f)}?v=${Date.now()}`;
        }
      })
    );
    res.json(withMeta);
  } catch (err) {
    console.error('Error listing site images:', err.message);
    res.status(500).json([]);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/admissions', admissionsRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/subjects', subjectsRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('If you see MongoDB errors above, make sure MongoDB is running.');
});
