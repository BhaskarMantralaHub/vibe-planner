'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Text, Button } from '@/components/ui';
import { cn } from '@/lib/utils';

type CoinResult = 'heads' | 'tails' | null;

function fairToss(): 'heads' | 'tails' {
  try {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return array[0] % 2 === 0 ? 'heads' : 'tails';
  } catch {
    return Math.random() < 0.5 ? 'heads' : 'tails';
  }
}

function playCoinSound() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Whoosh — filtered noise
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

    // Metallic ring — rapid pings that decelerate
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

    // Landing clinks
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

interface CoinFlipPageProps {
  onContinue: () => void;
  className?: string;
}

function CoinFlipPage({ onContinue, className }: CoinFlipPageProps) {
  const [result, setResult] = useState<CoinResult>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const coinRef = useRef<HTMLDivElement>(null);
  const flipTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => { if (flipTimeoutRef.current) clearTimeout(flipTimeoutRef.current); };
  }, []);

  const handleFlip = useCallback(() => {
    if (isFlipping) return;
    setIsFlipping(true);
    setResult(null);
    playCoinSound();

    const outcome = fairToss();
    flipTimeoutRef.current = setTimeout(() => {
      setResult(outcome);
      setIsFlipping(false);
      playResultSound();
    }, 2000);
  }, [isFlipping]);

  return (
    <div className={cn('flex flex-col items-center', className)}>
      {/* Hero image */}
      <div className="relative overflow-hidden rounded-2xl mx-[-16px] w-[calc(100%+32px)]" style={{ height: 180 }}>
        <img
          src="/toss.png"
          alt="Cricket toss ceremony"
          className="w-full h-full object-cover object-top"
          style={{ filter: isFlipping ? 'brightness(1.1)' : 'brightness(1)', transition: 'filter 0.5s' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, transparent 30%, var(--bg) 100%)' }}
        />
      </div>

      {/* Title */}
      <div className="text-center mt-[-8px] mb-6 relative z-10">
        <Text size="2xs" weight="semibold" color="muted" uppercase tracking="wider">
          The Ritual
        </Text>
        <Text as="h2" size="xl" weight="bold" className="mt-1">
          Flip the Coin
        </Text>
      </div>

      {/* Coin */}
      <div className="relative mb-6" style={{ perspective: '800px' }}>
        <div
          ref={coinRef}
          onClick={handleFlip}
          data-result={result}
          className="relative w-[120px] h-[120px] cursor-pointer"
          style={{
            WebkitTransformStyle: 'preserve-3d',
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
          {/* Heads */}
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center"
            style={{
              WebkitBackfaceVisibility: 'hidden',
              backfaceVisibility: 'hidden',
              background: 'radial-gradient(circle at 35% 35%, #e8c87a, #b8860b 50%, #8b6914 100%)',
              boxShadow: result === 'heads' && !isFlipping
                ? '0 0 40px rgba(201, 145, 90, 0.4), inset 0 2px 8px rgba(255,255,255,0.25)'
                : '0 8px 32px rgba(0,0,0,0.3), inset 0 2px 8px rgba(255,255,255,0.25)',
              border: '4px solid rgba(232,200,122,0.3)',
            }}
          >
            <div className="text-center select-none">
              <div className="text-[48px] font-black leading-none" style={{ color: '#5c3a1e', textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>H</div>
              <div className="text-[9px] font-bold text-[#7a5530] tracking-[3px] uppercase -mt-1">Heads</div>
            </div>
          </div>

          {/* Tails */}
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center"
            style={{
              WebkitBackfaceVisibility: 'hidden',
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              background: 'radial-gradient(circle at 35% 35%, #e8e8e8, #a0a0a0 50%, #707070 100%)',
              boxShadow: result === 'tails' && !isFlipping
                ? '0 0 40px rgba(156, 163, 175, 0.4), inset 0 2px 8px rgba(255,255,255,0.3)'
                : '0 8px 32px rgba(0,0,0,0.3), inset 0 2px 8px rgba(255,255,255,0.3)',
              border: '4px solid rgba(255,255,255,0.15)',
            }}
          >
            <div className="text-center select-none">
              <div className="text-[48px] font-black leading-none" style={{ color: '#374151', textShadow: '0 2px 4px rgba(0,0,0,0.15)' }}>T</div>
              <div className="text-[9px] font-bold text-[#4b5563] tracking-[3px] uppercase -mt-1">Tails</div>
            </div>
          </div>
        </div>

        {/* Shadow under coin */}
        <div
          className="mx-auto mt-3 rounded-full bg-black/20 blur-md transition-all duration-500"
          style={{
            width: isFlipping ? '50px' : '100px',
            height: '10px',
            opacity: isFlipping ? 0.3 : 0.6,
          }}
        />
      </div>

      {/* Result text */}
      <div className="text-center h-[48px] flex flex-col items-center justify-center mb-6">
        {result && !isFlipping && (
          <Text as="p" size="xl" weight="bold" style={{ color: result === 'heads' ? '#fbbf24' : '#94a3b8' }}>
            {result === 'heads' ? 'HEADS!' : 'TAILS!'}
          </Text>
        )}
        {isFlipping && (
          <Text as="p" size="md" color="muted" className="animate-pulse">Flipping...</Text>
        )}
        {!result && !isFlipping && (
          <Text as="p" size="sm" color="dim">Tap the coin or button below</Text>
        )}
      </div>

      {/* Action buttons */}
      <div className="w-full flex flex-col gap-2">
        {!result && !isFlipping && (
          <Button variant="primary" brand="cricket" size="lg" fullWidth onClick={handleFlip}>
            Flip Coin
          </Button>
        )}
        {isFlipping && (
          <Button variant="primary" brand="cricket" size="lg" fullWidth disabled>
            Tossing...
          </Button>
        )}
        {result && !isFlipping && (
          <>
            <Button variant="primary" brand="cricket" size="lg" fullWidth onClick={onContinue}>
              Continue
            </Button>
            <Button variant="secondary" size="lg" fullWidth onClick={handleFlip}>
              Flip Again
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export { CoinFlipPage };
export type { CoinFlipPageProps };
