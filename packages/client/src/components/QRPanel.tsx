/** QR code display + URL for join panel */
export default function QRPanel({
  qrDataUrl,
  fullUrl,
  shortUrl,
  sessionCode,
  presentationUrl,
}: {
  qrDataUrl: string;
  fullUrl: string;
  shortUrl: string;
  sessionCode: string;
  presentationUrl?: string;
}) {
  const primaryUrl = shortUrl || fullUrl;

  return (
    <div className="flex flex-col items-center gap-6 rounded-[1.75rem] border border-zinc-200 bg-white/95 p-6 shadow-[0_24px_60px_rgba(88,64,39,0.12)] max-w-md mx-auto">
      {/* QR Code */}
      {qrDataUrl && (
        <img
          src={qrDataUrl}
          alt="Join QR code"
          className="w-56 h-56 rounded-2xl border border-zinc-200 bg-white p-3"
        />
      )}

      {/* Session code (large, easy to read from projector) */}
      <div className="text-center">
        <p className="text-zinc-500 text-sm uppercase tracking-[0.22em] font-medium mb-1">
          Session Code
        </p>
        <p className="text-5xl font-mono font-bold text-zinc-900 tracking-[0.2em]">
          {sessionCode}
        </p>
      </div>

      {/* URLs */}
      <div className="text-center space-y-1 w-full">
        <a
          href={primaryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-indigo-600 font-semibold text-xl hover:underline break-all"
        >
          {primaryUrl}
        </a>
        <p className="text-xs text-zinc-500">Scan or type the link to join on any device.</p>
        {presentationUrl && (
          <a
            href={presentationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-700 transition-colors hover:border-indigo-300 hover:text-indigo-600"
          >
            Open presentation view
          </a>
        )}
      </div>
    </div>
  );
}
