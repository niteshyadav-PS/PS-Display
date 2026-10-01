export function Icon({ children, size = 20, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  )
}

export function DashboardIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 4h7v7H4V4Zm9 0h7v5h-7V4ZM4 13h7v7H4v-7Zm9 3h7v4h-7v-4Z" fill="currentColor" />
    </Icon>
  )
}

export function MonitorIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Icon>
  )
}

export function FolderIcon(props) {
  return (
    <Icon {...props}>
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </Icon>
  )
}

export function GearIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </Icon>
  )
}

export function BellIcon(props) {
  return (
    <Icon {...props}>
      <path
        d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 7H3s3 0 3-7ZM10 19a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </Icon>
  )
}

export function HelpIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M9.5 9a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1.9-1.1 1.8M12 17h.01"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </Icon>
  )
}

export function SearchIcon(props) {
  return (
    <Icon {...props} size={props.size || 16}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Icon>
  )
}

export function MenuIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Icon>
  )
}

export function CloseIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Icon>
  )
}

export function PlusIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </Icon>
  )
}

export function UsersIcon(props) {
  return (
    <Icon {...props}>
      <path
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </Icon>
  )
}

export function LayoutIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="1.7" />
    </Icon>
  )
}

export function ActivityIcon(props) {
  return (
    <Icon {...props}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function CalendarIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Icon>
  )
}

export function GlobeIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" stroke="currentColor" strokeWidth="1.5" />
    </Icon>
  )
}

export function FlameIcon(props) {
  return (
    <Icon {...props}>
      <path
        d="M12 22c4 0 7-3.2 7-7.5 0-3.5-2-5.8-4-7.5-.4 2.2-1.7 3.3-3 3.5C13 7 11 4 12 2c-4 3-7 6.5-7 12.5C5 18.8 8 22 12 22Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </Icon>
  )
}

export function AndroidIcon(props) {
  return (
    <Icon {...props}>
      <path d="M7 10v6M17 10v6M8 17h8v2a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M16 10H8a4 4 0 0 1 8 0Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="m8 7-1.5-2.5M16 7l1.5-2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Icon>
  )
}

export function TvIcon(props) {
  return (
    <Icon {...props}>
      <rect x="2" y="5" width="20" height="13" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="m8 21 4-3 4 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function PhoneIcon(props) {
  return (
    <Icon {...props}>
      <rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M11 18h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Icon>
  )
}

export function TerminalIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="m7 9 3 3-3 3M12 15h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function SpeakerIcon(props) {
  return (
    <Icon {...props}>
      <rect x="6" y="3" width="12" height="18" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="14" r="3" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="7" r="1" fill="currentColor" />
    </Icon>
  )
}

export function KeyIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="15" r="4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M11 12l8-8 2 2-2 2-2-1-2 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function PencilIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </Icon>
  )
}

export function LinkIcon(props) {
  return (
    <Icon {...props}>
      <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Icon>
  )
}

export function LockIcon(props) {
  return (
    <Icon {...props}>
      <rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Icon>
  )
}

export function LogoutIcon(props) {
  return (
    <Icon {...props}>
      <path d="M10 17v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2M15 8l4 4-4 4M8 12h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function HandIcon(props) {
  return (
    <Icon {...props}>
      <path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v8c0 3.5-2.5 6-6 6h-1a5 5 0 0 1-5-5v-3.5a1.5 1.5 0 0 1 3 0V13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Icon>
  )
}

export function RulerIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 16 16 4l4 4L8 20 4 16Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m8 12 1.5 1.5M11 9l1.5 1.5M14 6l1.5 1.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Icon>
  )
}

export function SparklesIcon(props) {
  return (
    <Icon {...props} size={props.size || 18}>
      <path
        d="M12 3.5 13.2 8.5 18 9.5 13.2 10.5 12 15.5 10.8 10.5 6 9.5 10.8 8.5 12 3.5Z"
        fill="currentColor"
      />
      <path
        d="M18.5 14.5 19.1 16.6 21 17.2 19.1 17.8 18.5 20 17.9 17.8 16 17.2 17.9 16.6 18.5 14.5Z"
        fill="currentColor"
      />
      <path
        d="M6.5 13 7 14.8 8.5 15.3 7 15.8 6.5 17.5 6 15.8 4.5 15.3 6 14.8 6.5 13Z"
        fill="currentColor"
      />
    </Icon>
  )
}

export function LayersIcon(props) {
  return (
    <Icon {...props} size={props.size || 18}>
      <path
        d="M12 3 3.5 8 12 13l8.5-5L12 3ZM3.5 12 12 17l8.5-5M3.5 16 12 21l8.5-5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  )
}

export function ImageIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" />
      <path d="m21 15-4.5-4.5L7 20" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </Icon>
  )
}

export function ChevronRightIcon(props) {
  return (
    <Icon {...props} size={props.size || 18}>
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function ChevronLeftIcon(props) {
  return (
    <Icon {...props} size={props.size || 18}>
      <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function CheckIcon(props) {
  return (
    <Icon {...props} size={props.size || 14}>
      <path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function CopyIcon(props) {
  return (
    <Icon {...props} size={props.size || 16}>
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4H5.5A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Icon>
  )
}

export function TrashIcon(props) {
  return (
    <Icon {...props} size={props.size || 16}>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v5M14 11v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function ClockIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function WifiOffIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 12.5a10 10 0 0 1 3.2-2.1M15.8 10.4A10 10 0 0 1 19 12.5M8.5 15.8a6 6 0 0 1 2-1.1M13.5 14.7a6 6 0 0 1 2 1.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" />
    </Icon>
  )
}

export function RefreshIcon(props) {
  return (
    <Icon {...props} size={props.size || 16}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5.5V11h-5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function FilterIcon(props) {
  return (
    <Icon {...props} size={props.size || 16}>
      <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Icon>
  )
}
