import mongoose from 'mongoose'
import { nanoid } from 'nanoid'
import config from './config/env.js'
import User from './models/User.js'
import Display from './models/Display.js'
import Media from './models/Media.js'
import SupportRequest from './models/SupportRequest.js'

const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'admin1234'
const USER_PASSWORD = process.env.SEED_USER_PASSWORD || 'password123'

function samplePages(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: nanoid(8),
    name: `Page ${i + 1}`,
    durationSec: 10,
    backgroundColor: '#ffffff',
    schedule: {},
    widgets:
      i === 0
        ? [
            { id: nanoid(8), type: 'clock', x: 50, y: 40, w: 300, h: 160, props: {} },
            {
              id: nanoid(8),
              type: 'weather',
              x: 900,
              y: 40,
              w: 300,
              h: 140,
              props: { city: 'Pune', condition: 'Partly Cloudy' },
            },
            {
              id: nanoid(8),
              type: 'text',
              x: 50,
              y: 240,
              w: 560,
              h: 220,
              props: {
                title: 'Company Announcement',
                body: 'Welcome to Profile Solution data center operations briefing.',
              },
            },
            {
              id: nanoid(8),
              type: 'calendar',
              x: 650,
              y: 240,
              w: 550,
              h: 220,
              props: {
                title: "Today's Schedule",
                items: [
                  { time: '10:00', label: 'NOC standup' },
                  { time: '13:30', label: 'Client walkthrough' },
                  { time: '16:00', label: 'Maintenance window' },
                ],
              },
            },
            {
              id: nanoid(8),
              type: 'dashboard',
              x: 50,
              y: 500,
              w: 1150,
              h: 120,
              props: {
                title: 'Company KPIs',
                metrics: [
                  { label: 'Projects', value: 42 },
                  { label: 'In Progress', value: 18 },
                  { label: 'Overdue', value: 8 },
                ],
              },
            },
          ]
        : [],
  }))
}

async function seed() {
  await mongoose.connect(config.mongoUri)

  await Promise.all([
    User.deleteMany({}),
    Display.deleteMany({}),
    Media.deleteMany({}),
    SupportRequest.deleteMany({}),
  ])

  const admin = await User.create({
    name: 'Admin',
    username: 'admin',
    email: 'admin@profilesolution.com',
    password: ADMIN_PASSWORD,
    role: 'Administrator',
    department: 'Project',
    organizationName: 'Profile Solution',
  })

  await User.create({
    name: 'John Doe',
    username: 'john',
    email: 'john@profilesolution.com',
    password: USER_PASSWORD,
    role: 'User',
    department: 'Sale & Marketing',
  })

  await Display.create([
    {
      name: 'Sales & Marketing',
      deviceType: 'web',
      layout: '2-columns',
      location: 'Lobby',
      status: 'Active',
      published: true,
      createdBy: admin._id,
      pages: samplePages(5),
    },
    {
      name: 'Sales Head',
      deviceType: 'android',
      layout: 'header-content',
      location: 'Conference',
      status: 'Active',
      published: true,
      createdBy: admin._id,
      pages: samplePages(3),
      // Office-hours example so the scheduling UI has something real to show.
      schedule: {
        enabled: true,
        startTime: '09:00',
        endTime: '19:00',
        daysOfWeek: [1, 2, 3, 4, 5],
      },
    },
  ])

  console.log('Seed complete')
  console.log(`Login: admin@profilesolution.com / ${ADMIN_PASSWORD}`)
  await mongoose.disconnect()
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
