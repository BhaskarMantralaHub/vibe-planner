'use client';

import { useState, useCallback, useRef } from 'react';

type TossResult = 'heads' | 'tails' | null;

// Cryptographically fair coin toss
function fairToss(): TossResult {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % 2 === 0 ? 'heads' : 'tails';
}

// Coin flip sound — whoosh + metallic spinning + landing clink
function playCoinSound() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // 1. Whoosh — filtered noise rising then falling
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(300, now);
    noiseFilter.frequency.linearRampToValueAtTime(2000, now + 0.3);
    noiseFilter.frequency.linearRampToValueAtTime(500, now + 1.8);
    noiseFilter.Q.value = 1;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.06, now);
    noiseGain.gain.linearRampToValueAtTime(0.03, now + 1.0);
    noiseGain.gain.linearRampToValueAtTime(0, now + 1.8);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 1.8);

    // 2. Metallic ring — rapid pings that decelerate
    let t = 0;
    for (let i = 0; i < 16; i++) {
      const speed = i < 8 ? 0.06 + i * 0.005 : 0.1 + (i - 8) * 0.03;
      t += speed;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 3500 + (i % 2) * 800;
      const vol = 0.05 * Math.max(0, 1 - i / 20);
      gain.gain.setValueAtTime(vol, now + t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.015);
      osc.start(now + t);
      osc.stop(now + t + 0.02);
    }

    // 3. Landing — two metallic clinks (bounce)
    [1.85, 1.93].forEach((time, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.value = 1200 - i * 400;
      gain.gain.setValueAtTime(0.1 / (i + 1), now + time);
      gain.gain.exponentialRampToValueAtTime(0.001, now + time + 0.06);
      osc.start(now + time);
      osc.stop(now + time + 0.08);
    });

    setTimeout(() => ctx.close(), 3000);
  } catch { /* silent */ }
}

// Result — coin settle "ding"
function playResultSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 1800;
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    setTimeout(() => ctx.close(), 1000);
  } catch { /* silent */ }
}

export default function TossWidget() {
  const [result, setResult] = useState<TossResult>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [history, setHistory] = useState<TossResult[]>([]);
  const [showParticles, setShowParticles] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const coinRef = useRef<HTMLDivElement>(null);

  const handleToss = useCallback(() => {
    if (isFlipping) return;

    setIsFlipping(true);
    setResult(null);
    setShowParticles(false);

    // Play spin sound
    playCoinSound();

    // Determine result upfront
    const outcome = fairToss();

    // Coin flips for ~2 seconds, then lands
    setTimeout(() => {
      setResult(outcome);
      setIsFlipping(false);
      setShowParticles(true);
      setHistory((prev) => [outcome, ...prev].slice(0, 20));
      playResultSound();

      // Hide particles after animation
      setTimeout(() => setShowParticles(false), 1500);
    }, 2000);
  }, [isFlipping]);

  const headsCount = history.filter((h) => h === 'heads').length;
  const tailsCount = history.filter((h) => h === 'tails').length;

  return (
    <div className="min-h-[calc(100vh-52px)] flex flex-col items-center px-4 py-6 relative overflow-hidden">

      {/* Hero — image with coin overlaid */}
      <div className="relative w-full max-w-lg mx-auto mb-6">
        {/* Image */}
        <img
          src="/toss.png"
          alt="Cricket Toss"
          className="w-full max-h-[25vh] lg:max-h-[35vh] object-cover object-top rounded-2xl shadow-xl"
          style={{ filter: isFlipping ? 'brightness(1.1)' : 'brightness(1)', transition: 'filter 0.5s' }}
        />

      </div>

      {/* Title below image */}
      <div className="text-center mb-4">
        <h1 className="text-[12px] uppercase tracking-[3px] text-[var(--muted)] font-medium mb-1">
          🏏 ICC Cricket Standard
        </h1>
        <h2 className="text-[24px] lg:text-[32px] font-bold bg-gradient-to-r from-[var(--purple)] via-[var(--blue)] to-[var(--indigo)] bg-clip-text text-transparent">
          Coin Toss
        </h2>
      </div>

      {/* Coin */}
      <div className="relative mb-4 lg:mb-8" style={{ perspective: '800px' }}>
        {/* Particles on result */}
        {showParticles && <Particles result={result} />}

        <div
          ref={coinRef}
          onClick={handleToss}
          className="relative w-[140px] h-[140px] lg:w-[220px] lg:h-[220px] cursor-pointer"
          data-result={result}
          style={{
            transformStyle: 'preserve-3d',
            animation: isFlipping
              ? 'coinFlip 2s ease-out forwards'
              : !result ? 'coinIdle 3s ease-in-out infinite' : undefined,
            transform: !isFlipping && result
              ? result === 'tails' ? 'rotateY(180deg)' : 'rotateY(0deg)'
              : undefined,
            transition: !isFlipping && result ? 'transform 0.3s ease' : undefined,
          }}
        >
          {/* Heads — bronze coin */}
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center"
            style={{
              backfaceVisibility: 'hidden',
              background: 'radial-gradient(circle at 35% 35%, #e8c87a, #b8860b 50%, #8b6914 100%)',
              boxShadow: result === 'heads' && !isFlipping
                ? '0 0 40px rgba(201, 145, 90, 0.4), inset 0 2px 8px rgba(255,255,255,0.25), inset 0 -2px 6px rgba(0,0,0,0.2)'
                : '0 8px 32px rgba(0,0,0,0.3), inset 0 2px 8px rgba(255,255,255,0.25), inset 0 -2px 6px rgba(0,0,0,0.2)',
              border: '4px solid rgba(232,200,122,0.3)',
            }}
          >
            <div className="text-center select-none">
              <div className="text-[56px] lg:text-[88px] font-black leading-none" style={{ color: '#5c3a1e', textShadow: '0 2px 4px rgba(0,0,0,0.2), 0 -1px 0 rgba(255,255,255,0.15)' }}>H</div>
              <div className="text-[10px] lg:text-[11px] font-bold text-[#7a5530] tracking-[3px] uppercase -mt-1">Heads</div>
            </div>
          </div>

          {/* Tails — silver coin */}
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              background: 'radial-gradient(circle at 35% 35%, #e8e8e8, #a0a0a0 50%, #707070 100%)',
              boxShadow: result === 'tails' && !isFlipping
                ? '0 0 40px rgba(156, 163, 175, 0.4), inset 0 2px 8px rgba(255,255,255,0.3), inset 0 -2px 6px rgba(0,0,0,0.2)'
                : '0 8px 32px rgba(0,0,0,0.3), inset 0 2px 8px rgba(255,255,255,0.3), inset 0 -2px 6px rgba(0,0,0,0.2)',
              border: '4px solid rgba(255,255,255,0.15)',
            }}
          >
            <div className="text-center select-none">
              <div className="text-[56px] lg:text-[88px] font-black leading-none" style={{ color: '#374151', textShadow: '0 2px 4px rgba(0,0,0,0.15), 0 -1px 0 rgba(255,255,255,0.3)' }}>T</div>
              <div className="text-[10px] lg:text-[11px] font-bold text-[#4b5563] tracking-[3px] uppercase -mt-1">Tails</div>
            </div>
          </div>
        </div>

        {/* Shadow under coin */}
        <div
          className="mx-auto mt-4 rounded-full bg-black/20 blur-md transition-all duration-500"
          style={{
            width: isFlipping ? '60px' : '120px',
            height: '12px',
            opacity: isFlipping ? 0.3 : 0.6,
          }}
        />
      </div>

      {/* Result text */}
      <div className="text-center mb-4 lg:mb-8 h-[50px] lg:h-[80px] flex flex-col items-center justify-center">
        {result && !isFlipping && (
          <div className="animate-[bounceIn_0.5s_ease-out]">
            <div className="text-[28px] lg:text-[44px] font-black uppercase tracking-wider"
              style={{ color: result === 'heads' ? '#fbbf24' : '#94a3b8' }}>
              {result === 'heads' ? 'HEADS!' : 'TAILS!'}
            </div>
          </div>
        )}
        {isFlipping && (
          <div className="text-[18px] text-[var(--muted)] animate-pulse">
            Flipping...
          </div>
        )}
        {!result && !isFlipping && (
          <div className="text-[16px] text-[var(--dim)]">
            Tap the coin to toss
          </div>
        )}
      </div>

      {/* Toss button */}
      <button
        onClick={handleToss}
        disabled={isFlipping}
        className="px-6 py-3 lg:px-8 lg:py-3.5 rounded-2xl text-[15px] lg:text-[17px] font-semibold transition-all shadow-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
        style={{
          background: 'linear-gradient(135deg, var(--purple), var(--indigo))',
          color: '#fff',
          boxShadow: '0 8px 30px rgba(139, 92, 246, 0.3)',
        }}
      >
        {isFlipping ? 'Tossing...' : result ? 'Toss Again' : 'Flip Coin'}
      </button>

      {/* History */}
      {history.length > 0 && (
        <div className="mt-10 w-full max-w-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[14px] text-[var(--muted)]">History</span>
            <div className="flex items-center gap-3 text-[13px]">
              <span className="text-amber-400 font-semibold">H: {headsCount}</span>
              <span className="text-gray-400 font-semibold">T: {tailsCount}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {history.map((h, i) => (
              <div
                key={i}
                className="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-bold transition-all"
                style={{
                  background: h === 'heads'
                    ? 'linear-gradient(145deg, #ffd700, #b8860b)'
                    : 'linear-gradient(145deg, #c0c0c0, #808080)',
                  color: h === 'heads' ? '#78350f' : '#374151',
                  opacity: 1 - i * 0.04,
                  animation: i === 0 ? 'bounceIn 0.3s ease-out' : undefined,
                }}
              >
                {h === 'heads' ? 'H' : 'T'}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="mt-10 max-w-sm mx-auto">
        <button
          onClick={() => setShowDisclaimer(!showDisclaimer)}
          className="text-[12px] text-[var(--dim)] hover:text-[var(--muted)] transition-colors cursor-pointer flex items-center gap-1 mx-auto"
        >
          <span>ⓘ</span>
          <span>Fair Play Notice</span>
        </button>
        {showDisclaimer && (
          <div className="mt-2 text-[12px] text-[var(--dim)] text-center leading-relaxed animate-[slideIn_0.15s] bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)]">
            <p className="font-medium text-[var(--muted)] mb-1">This is a fair, unbiased toss.</p>
            <p>Each flip uses your device&apos;s cryptographic random number generator — the same technology used in banking and security systems. No pattern, no memory, no bias. Every toss is an independent 50/50 event, just like a real coin.</p>
          </div>
        )}
      </div>

    </div>
  );
}

// Particle burst effect
function Particles({ result }: { result: TossResult }) {
  const particles = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * 360;
    const distance = 80 + Math.random() * 60;
    const size = 4 + Math.random() * 6;
    const delay = Math.random() * 0.2;
    const color = result === 'heads'
      ? `hsl(${40 + Math.random() * 20}, 90%, ${60 + Math.random() * 20}%)`
      : `hsl(${200 + Math.random() * 20}, 10%, ${60 + Math.random() * 20}%)`;

    return (
      <div
        key={i}
        className="absolute rounded-full"
        style={{
          width: size,
          height: size,
          background: color,
          top: '50%',
          left: '50%',
          animation: `particleBurst 1s ease-out ${delay}s forwards`,
          '--tx': `${Math.cos((angle * Math.PI) / 180) * distance}px`,
          '--ty': `${Math.sin((angle * Math.PI) / 180) * distance}px`,
        } as React.CSSProperties}
      />
    );
  });

  return <div className="absolute inset-0 pointer-events-none">{particles}</div>;
}
