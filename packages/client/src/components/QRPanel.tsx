/** QR code display + URL for join panel */
export default function QRPanel({
  qrDataUrl,
  fullUrl,
  shortUrl,
  sessionCode,
}: {
  qrDataUrl: string;
  fullUrl: string;
  shortUrl: string;
  sessionCode: string;
}) {
  const primaryUrl = shortUrl || fullUrl;

  return (
    <div className="flex flex-col items-center gap-6 p-6 bg-white rounded-2xl max-w-md mx-auto">
      {/* QR Code */}
      {qrDataUrl && (
        <img
          src={qrDataUrl}
          alt="Join QR code"
          className="w-56 h-56 rounded-lg"
        />
      )}

      {/* Session code (large, easy to read from projector) */}
      <div className="text-center">
        <p className="text-zinc-500 text-sm uppercase tracking-wide font-medium mb-1">
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
      </div>
    </div>
  );
}
