import mongoose from 'mongoose'

const mediaSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    type: { type: String, enum: ['image', 'video', 'pdf', 'other'], default: 'image', index: true },
    url: { type: String, required: true },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  },
  { timestamps: true }
)

mediaSchema.index({ uploadedBy: 1, createdAt: -1 })

export default mongoose.model('Media', mediaSchema)
