import { Volume2 } from 'lucide-react'

export default function AISpeakingIndicator() {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="w-20 h-20 rounded-full bg-brand-500/20 flex items-center justify-center">
          <Volume2 className="w-8 h-8 text-brand-400" />
        </div>
        <div className="absolute inset-0 rounded-full border-2 border-brand-500/50 animate-ping" />
        <div className="absolute inset-0 rounded-full border-2 border-brand-500/30 animate-ping" style={{ animationDelay: '0.5s' }} />
      </div>
      <p className="text-brand-400 font-medium">AI is speaking...</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="w-1.5 h-6 bg-brand-500 rounded-full animate-bounce"
            style={{
              animationDelay: `${i * 0.15}s`,
              height: `${12 + i * 4}px`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
