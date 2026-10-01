import logo from '../assets/Logo.png'

export default function AuthShell({ children }) {
  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-white px-4 py-10">
      <div className="pointer-events-none absolute -left-24 -top-20 h-[28rem] w-[28rem] rounded-full bg-brand/20 blur-[100px]" />
      <div className="pointer-events-none absolute -right-20 bottom-[-6rem] h-[24rem] w-[24rem] rounded-full bg-emerald-300/25 blur-[110px]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[20rem] w-[20rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-200/60 blur-[90px]" />

      <div className="relative z-10 w-full max-w-md">
        <header className="mb-8 flex justify-center">
          <img
            src={logo}
            alt="Profile Solution"
            className="h-20 w-auto object-contain sm:h-24"
          />
        </header>
        {children}
      </div>
    </div>
  )
}

export const glassCardClass =
  'flex flex-col gap-4 rounded-tl-[2.5rem] rounded-tr-2xl rounded-br-2xl rounded-bl-2xl border border-white/60 bg-white/55 p-5 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.18)] backdrop-blur-2xl sm:gap-5 sm:rounded-tl-[3rem] sm:p-7 md:p-8'

export const inputClass =
  'h-11 w-full rounded-xl border border-gray-200 bg-white/80 px-3.5 text-[0.95rem] text-gray-900 outline-none placeholder:text-gray-400 transition focus:border-brand focus:ring-3 focus:ring-brand/25'

export const primaryBtnClass =
  'h-11 cursor-pointer rounded-xl bg-brand text-base font-bold text-white transition hover:bg-brand-hover active:translate-y-px sm:h-12 sm:text-[1.05rem]'

export const secondaryBtnClass =
  'flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white/80 text-base font-semibold text-gray-800 transition hover:bg-white active:translate-y-px sm:h-12 sm:text-[1.05rem]'
