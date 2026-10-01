export default function EmptyState({ title, description }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm font-semibold text-gray-800">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">{description}</p> : null}
    </div>
  )
}
