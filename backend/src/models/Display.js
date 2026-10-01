import mongoose from 'mongoose'
import { nanoid } from 'nanoid'

const WIDGET_TYPES = [
  'clock',
  'weather',
  'calendar',
  'image',
  'video',
  'heading',
  'text',
  'pdf',
  'web',
  'dashboard',
  'quotes',
  'news',
  'notes',
]

const widgetSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: { type: String, enum: WIDGET_TYPES, required: true },
    x: { type: Number, default: 40 },
    y: { type: Number, default: 40 },
    w: { type: Number, default: 320 },
    h: { type: Number, default: 160 },
    props: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
)

/**
 * Dayparting rules. An empty/disabled schedule always plays.
 * `daysOfWeek` uses 0 = Sunday; an empty array means every day.
 */
const scheduleSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    startTime: { type: String, default: '' },
    endTime: { type: String, default: '' },
    daysOfWeek: { type: [Number], default: [] },
    timezone: { type: String, default: '' },
  },
  { _id: false }
)

const pageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, default: 'Page 1' },
    durationSec: { type: Number, default: 10, min: 1, max: 3600 },
    backgroundColor: { type: String, default: '#ffffff' },
    backgroundImage: { type: String, default: '' },
    backgroundFit: { type: String, enum: ['cover', 'contain', 'fill'], default: 'cover' },
    backgroundBrightness: { type: Number, default: 100, min: 20, max: 160 },
    overlay: {
      type: { type: String, default: 'none' },
      opacity: { type: Number, default: 0.55, min: 0, max: 1 },
      message: { type: String, default: '' },
      scheduleMode: { type: String, default: 'always' },
      startDate: { type: String, default: '' },
      endDate: { type: String, default: '' },
      month: { type: Number, default: 1, min: 1, max: 12 },
      day: { type: Number, default: 1, min: 1, max: 31 },
      daysBefore: { type: Number, default: 0, min: 0, max: 30 },
    },
    widgets: { type: [widgetSchema], default: [] },
    schedule: { type: scheduleSchema, default: () => ({}) },
  },
  { _id: false }
)

const displaySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    deviceType: {
      type: String,
      enum: ['web', 'android', 'fire', 'tizen', 'webos', 'ios', 'windows', 'echo'],
      default: 'web',
    },
    layout: {
      type: String,
      enum: ['blank', '1-column', '2-columns', '3-columns', 'header-content', 'sidebar-content'],
      default: 'blank',
    },
    orientation: { type: String, enum: ['Landscape', 'Portrait'], default: 'Landscape' },
    location: { type: String, default: 'Lobby' },
    department: { type: String, default: '', trim: true },
    status: { type: String, enum: ['Active', 'Inactive', 'Pending'], default: 'Pending' },
    deviceCode: { type: String, unique: true, index: true },
    publicKey: { type: String, unique: true, index: true },
    pages: { type: [pageSchema], default: [] },
    schedule: { type: scheduleSchema, default: () => ({}) },
    published: { type: Boolean, default: false },
    /** Remote kill-switch: player stays online but shows a stopped screen. */
    playbackStopped: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

    // Pairing + health
    pairedAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    lastSeenUserAgent: { type: String, default: '' },
    heartbeatCount: { type: Number, default: 0 },
  },
  { timestamps: true }
)

displaySchema.index({ createdBy: 1, updatedAt: -1 })

/** Short, unambiguous pairing code (no 0/O/1/I) that is easy to read off a TV. */
const PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateDeviceCode() {
  let code = ''
  for (let i = 0; i < 6; i += 1) {
    code += PAIRING_ALPHABET[Math.floor(Math.random() * PAIRING_ALPHABET.length)]
  }
  return code
}

displaySchema.pre('validate', function ensureKeys(next) {
  if (!this.deviceCode) this.deviceCode = generateDeviceCode()
  if (!this.publicKey) this.publicKey = nanoid(16)
  if (!this.pages?.length) {
    this.pages = [
      {
        id: nanoid(8),
        name: 'Page 1',
        durationSec: 10,
        backgroundColor: '#ffffff',
        widgets: [],
      },
    ]
  }
  next()
})

export default mongoose.model('Display', displaySchema)
