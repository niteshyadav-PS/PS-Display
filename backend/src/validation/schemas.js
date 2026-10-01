import { z } from 'zod'

export const WIDGET_TYPES = [
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

export const DEVICE_TYPES = ['web', 'android', 'fire', 'tizen', 'webos', 'ios', 'windows', 'echo']
export const LAYOUTS = ['blank', '1-column', '2-columns', '3-columns', 'header-content', 'sidebar-content']
export const ORIENTATIONS = ['Landscape', 'Portrait']
export const STATUSES = ['Active', 'Inactive', 'Pending']

export const DATE_TIME_FORMATS = [
  'DD/MM/YYYY HH:mm',
  'MM/DD/YYYY hh:mm A',
  'YYYY-MM-DD HH:mm',
  'DD MMM YYYY, HH:mm',
]

const CANVAS_W = 1280
const CANVAS_H = 720
const hexColor = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'must be a hex colour like #8bc53f')

/** Empty string / whitespace → undefined so optional fields stay optional. */
const emptyToUndef = (value) => {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string' && !value.trim()) return undefined
  return value
}

/**
 * HH:mm in 24-hour form. Browsers sometimes send HH:mm:ss from <input type="time">;
 * Mongo may store "" when a schedule was never filled in.
 */
const timeOfDay = z.preprocess(emptyToUndef, z
  .string()
  .trim()
  .transform((value) => {
    // Strip seconds if present (e.g. "09:30:00" → "09:30")
    const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value)
    if (!match) return value
    return `${match[1]}:${match[2]}`
  })
  .refine((value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value), {
    message: 'must be a time like 09:30',
  })
  .optional())

const optionalDate = z.preprocess(emptyToUndef, z.coerce.date().optional())

export const scheduleSchema = z
  .object({
    enabled: z.boolean().default(false),
    startDate: optionalDate,
    endDate: optionalDate,
    startTime: timeOfDay,
    endTime: timeOfDay,
    /** 0 = Sunday. Empty array means every day. */
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    timezone: z.preprocess(emptyToUndef, z.string().trim().max(64).optional()).default(''),
  })
  .partial()
  .refine(
    (value) => !value.startDate || !value.endDate || value.endDate >= value.startDate,
    { message: 'End date must be on or after the start date', path: ['endDate'] }
  )

export const widgetSchema = z.object({
  id: z.string().trim().min(1).max(64),
  type: z.enum(WIDGET_TYPES),
  x: z.coerce.number().finite().min(-CANVAS_W).max(CANVAS_W * 2).default(40),
  y: z.coerce.number().finite().min(-CANVAS_H).max(CANVAS_H * 2).default(40),
  w: z.coerce.number().finite().min(20).max(CANVAS_W * 2).default(320),
  h: z.coerce.number().finite().min(20).max(CANVAS_H * 2).default(160),
  /** Widget props are free-form per type, but capped so a page cannot be used as blob storage. */
  props: z.record(z.string(), z.unknown()).default({}),
})

export const pageSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(80).default('Page 1'),
  durationSec: z.coerce.number().int().min(1).max(3600).default(10),
  backgroundColor: hexColor.default('#ffffff'),
  backgroundImage: z.preprocess(emptyToUndef, z.string().trim().max(2000).optional()).default(''),
  backgroundFit: z.enum(['cover', 'contain', 'fill']).default('cover'),
  backgroundBrightness: z.coerce.number().min(20).max(160).default(100),
  overlay: z
    .object({
      type: z
        .enum([
          'none',
          'birthday',
          'balloons',
          'celebration',
          'hearts',
          'anniversary',
          'confetti',
          'snowfall',
          'vignette',
          'dim',
          'soft-glow',
          'brand-wash',
          'scanlines',
        ])
        .default('none'),
      opacity: z.coerce.number().min(0).max(1).default(0.55),
      message: z.string().trim().max(120).default(''),
      scheduleMode: z.enum(['always', 'range', 'annual']).default('always'),
      startDate: z.preprocess(emptyToUndef, z.string().trim().max(10).optional()).default(''),
      endDate: z.preprocess(emptyToUndef, z.string().trim().max(10).optional()).default(''),
      month: z.coerce.number().int().min(1).max(12).default(1),
      day: z.coerce.number().int().min(1).max(31).default(1),
      daysBefore: z.coerce.number().int().min(0).max(30).default(0),
    })
    .default({ type: 'none', opacity: 0.55, message: '', scheduleMode: 'always' }),
  widgets: z.array(widgetSchema).max(60).default([]),
  schedule: scheduleSchema.optional(),
})

export const createDisplaySchema = z.object({
  name: z.string().trim().min(1, 'Display name is required').max(120),
  deviceType: z.enum(DEVICE_TYPES).default('web'),
  layout: z.enum(LAYOUTS).default('blank'),
  orientation: z.enum(ORIENTATIONS).default('Landscape'),
  location: z.string().trim().max(120).default('Lobby'),
  department: z.string().trim().max(120).default(''),
})

export const updateDisplaySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    deviceType: z.enum(DEVICE_TYPES),
    layout: z.enum(LAYOUTS),
    orientation: z.enum(ORIENTATIONS),
    location: z.string().trim().max(120),
    department: z.string().trim().max(120),
    status: z.enum(STATUSES),
    pages: z.array(pageSchema).min(1, 'A display needs at least one page').max(50),
    published: z.boolean(),
    schedule: scheduleSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' })

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required').max(120),
  password: z.string().min(1, 'Password is required'),
})

export const updateMeSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    avatar: z.string().trim().max(2048),
    department: z.string().trim().max(120),
    organizationName: z.string().trim().max(160),
    dateTimeFormat: z.enum(DATE_TIME_FORMATS),
    email: z.string().trim().toLowerCase().email('A valid email is required'),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' })

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(200),
})

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'Username must be at least 2 characters')
  .max(40)
  .regex(/^[a-z0-9._-]+$/, 'Username can use letters, numbers, dots, and dashes')

export const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  username: usernameSchema,
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  department: z.string().trim().max(120).default(''),
  role: z.enum(['Administrator', 'User']).default('User'),
  email: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().toLowerCase().email('A valid email is required').optional()
  ),
})

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    username: usernameSchema,
    password: z.string().min(8, 'Password must be at least 8 characters').max(200),
    department: z.string().trim().max(120),
    role: z.enum(['Administrator', 'User']),
    email: z.string().trim().toLowerCase().email('A valid email is required'),
    mailConnected: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' })

export const contactAdminSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  subject: z.string().trim().min(1, 'Subject is required').max(200),
  message: z.string().trim().min(1, 'Message is required').max(4000),
})

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email is required'),
})

export const createMediaSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  url: z.string().trim().url('A valid URL is required').max(2048),
  type: z.enum(['image', 'video', 'pdf', 'other']).default('image'),
  size: z.coerce.number().int().min(0).default(0),
})

export const pairDeviceSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(4, 'Enter the code shown on the screen')
    .max(24),
})
