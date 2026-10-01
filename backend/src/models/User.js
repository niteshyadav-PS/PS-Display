import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    mailConnected: { type: Boolean, default: false },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ['Administrator', 'User'], default: 'User' },
    avatar: { type: String, default: '' },
    department: { type: String, default: '' },
    organizationName: { type: String, default: '' },
    dateTimeFormat: {
      type: String,
      enum: [
        'DD/MM/YYYY HH:mm',
        'MM/DD/YYYY hh:mm A',
        'YYYY-MM-DD HH:mm',
        'DD MMM YYYY, HH:mm',
      ],
      default: 'DD/MM/YYYY HH:mm',
    },
    googleEmail: { type: String, default: '' },
    googleRefreshToken: { type: String, default: '' },
    googleConnectedAt: { type: Date },
    departmentGoogle: {
      type: [
        {
          department: { type: String, required: true, trim: true },
          googleEmail: { type: String, default: '' },
          googleRefreshToken: { type: String, default: '' },
          googleConnectedAt: { type: Date },
        },
      ],
      default: [],
    },

    // Password reset
    resetTokenHash: { type: String, default: '', select: false },
    resetTokenExpiresAt: { type: Date, default: null, select: false },

    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
)

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 12)
  next()
})

userSchema.methods.comparePassword = function comparePassword(candidate) {
  if (!this.password) return Promise.resolve(false)
  return bcrypt.compare(candidate, this.password)
}

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    username: this.username || String(this.email || '').split('@')[0],
    email: this.email,
    mailConnected: Boolean(this.mailConnected),
    role: this.role === 'Administrator' ? 'Administrator' : 'User',
    avatar: this.avatar || '',
    department: this.department || '',
    organizationName: this.organizationName || '',
    dateTimeFormat: this.dateTimeFormat || 'DD/MM/YYYY HH:mm',
    googleEmail: this.googleEmail || '',
    googleConnected: Boolean(this.googleRefreshToken),
    departmentGoogle: (this.departmentGoogle || []).map((row) => ({
      department: row.department,
      googleEmail: row.googleEmail || '',
      connected: Boolean(row.googleRefreshToken),
    })),
    lastLoginAt: this.lastLoginAt || null,
    createdAt: this.createdAt,
  }
}

export default mongoose.model('User', userSchema)
