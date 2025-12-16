import mongoose from 'mongoose';

const qualificationSchema = new mongoose.Schema({
  degree: { type: String, required: true },
  institution: { type: String, required: true },
  year: { type: Number, required: true },
  specialization: String,
  percentage: Number,
  university: String
}, { _id: false });

const experienceSchema = new mongoose.Schema({
  organization: { type: String, required: true },
  position: { type: String, required: true },
  from: { type: Date, required: true },
  to: Date,
  isCurrent: { type: Boolean, default: false },
  description: String
}, { _id: false });

const subjectExpertiseSchema = new mongoose.Schema({
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  level: {
    type: String,
    enum: ['primary', 'middle', 'high', 'senior'],
    required: true
  },
  yearsOfExperience: { type: Number, min: 0, default: 0 }
}, { _id: false });

const userSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['general', 'student', 'teacher', 'admin'],
    default: 'general'
  },

  // Account Status
  verified: {
    type: Boolean,
    default: false
  },
  isApproved: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },

  // For Teachers
  employeeId: {
    type: String,
    unique: true,
    sparse: true
  },
  subjects: [subjectExpertiseSchema],
  isClassTeacher: {
    type: Boolean,
    default: false
  },
  assignedClasses: [{
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class'
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject'
    },
    academicYear: String
  }],

  // For Students
  studentId: {
    type: String,
    unique: true,
    sparse: true
  },
  classAssigned: {
    type: Number,
    min: 1,
    max: 12
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class'
  },

  // Personal Information
  dateOfJoining: Date,
  dateOfBirth: Date,
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'prefer-not-to-say'],
    lowercase: true
  },
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', null],
    uppercase: true
  },

  // Contact Information
  contact: {
    phone: String,
    alternatePhone: String,
    emergencyContact: {
      name: String,
      relation: String,
      phone: String
    },
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: 'India' }
    }
  },

  // Professional Information (for teachers)
  qualifications: [qualificationSchema],
  experience: [experienceSchema],

  // System Fields
  lastLogin: Date,
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,

  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full name
userSchema.virtual('fullName').get(function () {
  return this.name;
});

// Indexes for better query performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ 'contact.phone': 1 });
userSchema.index({ employeeId: 1 }, { unique: true, sparse: true });
userSchema.index({ studentId: 1 }, { unique: true, sparse: true });

// Pre-save hook to handle employee/student ID generation
userSchema.pre('save', async function (next) {
  if (this.role === 'teacher' && !this.employeeId) {
    // Generate employee ID (you can implement your own logic here)
    const count = await this.constructor.countDocuments({ role: 'teacher' });
    this.employeeId = `T${String(count + 1).padStart(4, '0')}`;
  }
  // Student ID generation is handled in the admission approval process
  next();
});

export default mongoose.model('User', userSchema);
