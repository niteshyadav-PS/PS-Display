import mongoose from 'mongoose'

/** Requests submitted from the public "Contact Admin" form. */
const supportRequestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['Open', 'Resolved'],
      default: 'Open',
      index: true,
    },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

supportRequestSchema.index({ createdAt: -1 })

export default mongoose.model('SupportRequest', supportRequestSchema)
